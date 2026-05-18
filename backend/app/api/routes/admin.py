"""Panel de administración: estadísticas, auditoría de tickets y exportación."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy import asc, desc, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle
from app.services.admin_stats import (
    count_tickets_filtered,
    effective_ticket_datetime,
    liters_by_vehicle_month,
    resolve_period,
    summary_for_month,
    tickets_for_export,
    tickets_query_filtered,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

SORT_COLUMNS = Literal["fecha", "patente", "confidence_score", "ingested_at", "id"]
SORT_ORDER = Literal["asc", "desc"]


class TicketUpdateBody(BaseModel):
    litros: float | None = None
    kilometraje: int | None = None
    remito: str | None = None
    fecha: datetime | None = None
    is_verified: bool | None = None


def _ticket_row_dict(r: dict) -> dict[str, Any]:
    return {
        "id": r["id"],
        "cuit_proveedor": r["cuit_proveedor"],
        "nro_ticket": r["nro_ticket"],
        "litros": float(r["litros"]) if r["litros"] is not None else None,
        "kilometraje": r["kilometraje"],
        "tipo_combustible": r.get("tipo_combustible"),
        "remito": r.get("remito"),
        "operador_nombre": r.get("operador_nombre"),
        "fecha": r["fecha"].isoformat() if r["fecha"] else None,
        "ingested_at": r["ingested_at"].isoformat() if r["ingested_at"] else None,
        "url_imagen": r["url_imagen"],
        "confidence_score": r["confidence_score"],
        "is_verified": r["is_verified"],
        "verified_at": r["verified_at"].isoformat() if r.get("verified_at") else None,
        "vehicle_id": r["vehicle_id"],
        "patente": r["patente"],
    }


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Fecha inválida: {value}",
        ) from None


def _safe_image_path(settings: Any, stored_path: str) -> Path:
    try:
        p = Path(stored_path).resolve()
        root = Path(settings.upload_dir).resolve()
        p.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruta de imagen no permitida.") from exc
    if not p.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo de imagen no encontrado.")
    return p


@router.get("/stats/summary")
def admin_stats_summary(
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    period = resolve_period(year, month)
    return summary_for_month(db, period)


@router.get("/stats/vehicles")
def admin_stats_vehicles(
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    period = resolve_period(year, month)
    return {
        "year": period.year,
        "month": period.month,
        "vehicles": liters_by_vehicle_month(db, period),
    }


@router.get("/tickets")
def admin_list_tickets(
    db: Session = Depends(get_db),
    from_date: Annotated[str | None, Query(description="ISO8601 inicio (filtro por fecha ticket o ingesta)")] = None,
    to_date: Annotated[str | None, Query(description="ISO8601 fin")] = None,
    vehicle_id: Annotated[int | None, Query()] = None,
    min_confidence: Annotated[float | None, Query(ge=0, le=1)] = None,
    max_confidence: Annotated[float | None, Query(ge=0, le=1)] = None,
    is_verified: Annotated[bool | None, Query()] = None,
    sort_by: SORT_COLUMNS = "ingested_at",
    sort_order: SORT_ORDER = "desc",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    fd = _parse_iso_datetime(from_date)
    td = _parse_iso_datetime(to_date)

    base = tickets_query_filtered(
        from_date=fd,
        to_date=td,
        vehicle_id=vehicle_id,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        is_verified=is_verified,
    )
    total = db.scalar(count_tickets_filtered(
        from_date=fd,
        to_date=td,
        vehicle_id=vehicle_id,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        is_verified=is_verified,
    ))
    if total is None:
        total = 0

    eff = effective_ticket_datetime()
    order_col: Any = {
        "fecha": eff,
        "patente": Vehicle.patente,
        "confidence_score": Ticket.confidence_score,
        "ingested_at": Ticket.ingested_at,
        "id": Ticket.id,
    }[sort_by]
    direction = desc if sort_order == "desc" else asc
    # NULLS LAST en orden descendente de confianza/fecha
    if sort_order == "desc":
        order_expr = order_col.desc().nulls_last()
    else:
        order_expr = order_col.asc().nulls_last()

    rows = db.execute(base.order_by(order_expr).limit(limit).offset(offset)).mappings().all()
    items = [_ticket_row_dict(dict(r)) for r in rows]
    return {"total": int(total), "limit": limit, "offset": offset, "items": items}


@router.get("/tickets/{ticket_id}")
def admin_get_ticket(ticket_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.execute(
        select(
            Ticket.id,
            Ticket.cuit_proveedor,
            Ticket.nro_ticket,
            Ticket.litros,
            Ticket.kilometraje,
            Ticket.tipo_combustible,
            Ticket.remito,
            Ticket.operador_nombre,
            Ticket.fecha,
            Ticket.ingested_at,
            Ticket.url_imagen,
            Ticket.confidence_score,
            Ticket.is_verified,
            Ticket.verified_at,
            Ticket.vehicle_id,
            Vehicle.patente,
        )
        .select_from(Ticket)
        .outerjoin(Vehicle, Vehicle.id == Ticket.vehicle_id)
        .where(Ticket.id == ticket_id),
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado.")
    return _ticket_row_dict(dict(row))


@router.get("/tickets/{ticket_id}/image")
def admin_ticket_image(
    ticket_id: int,
    db: Session = Depends(get_db),
) -> FileResponse:
    settings = get_settings()
    t = db.get(Ticket, ticket_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado.")
    path = _safe_image_path(settings, t.url_imagen)
    media_type = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.patch("/tickets/{ticket_id}", status_code=status.HTTP_200_OK)
def admin_patch_ticket(
    ticket_id: int,
    body: TicketUpdateBody,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    t = db.get(Ticket, ticket_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado.")

    updates = body.model_dump(exclude_unset=True)
    if "litros" in updates:
        v = updates["litros"]
        t.litros = None if v is None else Decimal(str(v))
    if "kilometraje" in updates:
        t.kilometraje = updates["kilometraje"]
    if "remito" in updates:
        v = updates["remito"]
        if v is None:
            t.remito = None
        else:
            cleaned = str(v).strip()
            t.remito = cleaned[:64] if cleaned else None
    if "fecha" in updates:
        v = updates["fecha"]
        if v is None:
            t.fecha = None
        elif isinstance(v, datetime):
            t.fecha = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if "is_verified" in updates:
        t.is_verified = bool(updates["is_verified"])
        t.verified_at = datetime.now(timezone.utc) if t.is_verified else None

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Error al actualizar ticket %s", ticket_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo guardar el ticket.",
        ) from None

    db.refresh(t)
    return admin_get_ticket(ticket_id, db)


@router.get("/export/monthly.xlsx")
def admin_export_monthly(
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    period = resolve_period(year, month)
    rows = tickets_for_export(db, period)

    wb = Workbook()
    ws = wb.active
    ws.title = f"{period.year}-{period.month:02d}"
    headers = [
        "id",
        "patente",
        "cuit",
        "nro_ticket",
        "litros",
        "kilometraje",
        "tipo_combustible",
        "remito",
        "operador",
        "fecha_ticket",
        "ingested_at",
        "confidence",
        "verificado",
    ]
    ws.append(headers)
    for r in rows:
        ws.append(
            [
                r["id"],
                r["patente"],
                r["cuit_proveedor"],
                r["nro_ticket"],
                r["litros"],
                r["kilometraje"],
                r.get("tipo_combustible"),
                r.get("remito") or "No encontrado",
                r.get("operador_nombre") or "",
                r["fecha"],
                r["ingested_at"],
                r["confidence_score"],
                "Sí" if r["is_verified"] else "No",
            ],
        )

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"fuelops_{period.year}_{period.month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
