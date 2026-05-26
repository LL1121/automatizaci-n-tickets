"""Panel de administración: estadísticas, auditoría de tickets, exportación y carga masiva."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc, select
from sqlalchemy.orm import Session

from app.api.deps import AdminPrincipal
from app.core.config import get_settings
from app.core.security import create_admin_token, verify_password
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle
from app.services import admin_users as admin_users_service
from app.services.admin_users import AdminUserError
from app.services.admin_stats import (
    count_tickets_filtered,
    effective_ticket_datetime,
    liters_by_vehicle_month,
    resolve_period,
    summary_for_month,
    tickets_for_export,
    tickets_query_filtered,
)
from app.services.image_segmentation import (
    decode_image_bytes,
    encode_image_jpeg,
    segment_tickets,
)
from app.services.pdf_render import PdfRenderError, render_pdf_to_bgr
from app.services.ticket_ingest import IngestOutcome, ingest_ticket_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

auth_router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    token: str
    expires_at: str
    username: str
    full_name: str | None = None


class AdminUserOut(BaseModel):
    id: int
    username: str
    full_name: str | None
    is_active: bool
    created_at: str | None
    updated_at: str | None
    last_login_at: str | None


def _admin_to_out(admin: AdminUser) -> AdminUserOut:
    return AdminUserOut(
        id=admin.id,
        username=admin.username,
        full_name=admin.full_name,
        is_active=admin.is_active,
        created_at=admin.created_at.isoformat() if admin.created_at else None,
        updated_at=admin.updated_at.isoformat() if admin.updated_at else None,
        last_login_at=admin.last_login_at.isoformat() if admin.last_login_at else None,
    )


@auth_router.post("/login", response_model=LoginResponse)
def admin_login(body: LoginBody, db: Session = Depends(get_db)) -> LoginResponse:
    admin = admin_users_service.authenticate(db, body.username, body.password)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña inválidos.",
        )
    token, exp = create_admin_token(subject=admin.username, admin_id=admin.id)
    return LoginResponse(
        token=token,
        expires_at=exp.isoformat(),
        username=admin.username,
        full_name=admin.full_name,
    )


@auth_router.get("/me", response_model=AdminUserOut)
def admin_me(principal: AdminPrincipal) -> AdminUserOut:
    return _admin_to_out(principal)


# ---------------------------------------------------------------------------
# Gestión de usuarios admin
# ---------------------------------------------------------------------------


class AdminCreateBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    full_name: str | None = Field(default=None, max_length=120)


class AdminUpdateBody(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class AdminPasswordBody(BaseModel):
    new_password: str = Field(min_length=1, max_length=256)


class ChangeMyPasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


@router.get("/users", response_model=list[AdminUserOut])
def list_admin_users(
    _: AdminPrincipal,
    db: Session = Depends(get_db),
) -> list[AdminUserOut]:
    return [_admin_to_out(a) for a in admin_users_service.list_admins(db)]


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_admin_user(
    body: AdminCreateBody,
    _: AdminPrincipal,
    db: Session = Depends(get_db),
) -> AdminUserOut:
    try:
        admin = admin_users_service.create_admin(
            db,
            username=body.username,
            password=body.password,
            full_name=body.full_name,
        )
    except AdminUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return _admin_to_out(admin)


@router.patch("/users/{admin_id}", response_model=AdminUserOut)
def patch_admin_user(
    admin_id: int,
    body: AdminUpdateBody,
    principal: AdminPrincipal,
    db: Session = Depends(get_db),
) -> AdminUserOut:
    target = admin_users_service.get_admin_by_id(db, admin_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario admin no encontrado.")
    if body.full_name is not None:
        target = admin_users_service.update_full_name(db, target, body.full_name)
    if body.is_active is not None:
        if body.is_active is False and principal.id == target.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No podés desactivar tu propio usuario.",
            )
        try:
            target = admin_users_service.set_active(db, target, body.is_active)
        except AdminUserError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
    return _admin_to_out(target)


@router.post("/users/{admin_id}/password", response_model=AdminUserOut)
def admin_reset_password(
    admin_id: int,
    body: AdminPasswordBody,
    _: AdminPrincipal,
    db: Session = Depends(get_db),
) -> AdminUserOut:
    target = admin_users_service.get_admin_by_id(db, admin_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario admin no encontrado.")
    try:
        target = admin_users_service.set_password(db, target, body.new_password)
    except AdminUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return _admin_to_out(target)


@router.delete("/users/{admin_id}", response_model=AdminUserOut)
def deactivate_admin_user(
    admin_id: int,
    principal: AdminPrincipal,
    db: Session = Depends(get_db),
) -> AdminUserOut:
    target = admin_users_service.get_admin_by_id(db, admin_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario admin no encontrado.")
    if principal.id == target.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No podés desactivar tu propio usuario.",
        )
    try:
        target = admin_users_service.set_active(db, target, False)
    except AdminUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return _admin_to_out(target)


@auth_router.post("/change-password", response_model=AdminUserOut)
def change_my_password(
    body: ChangeMyPasswordBody,
    principal: AdminPrincipal,
    db: Session = Depends(get_db),
) -> AdminUserOut:
    if not verify_password(body.current_password, principal.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La contraseña actual no es correcta.",
        )
    try:
        updated = admin_users_service.set_password(db, principal, body.new_password)
    except AdminUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return _admin_to_out(updated)

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
    _: AdminPrincipal,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    period = resolve_period(year, month)
    return summary_for_month(db, period)


@router.get("/stats/vehicles")
def admin_stats_vehicles(
    _: AdminPrincipal,
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
    _: AdminPrincipal,
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
def admin_get_ticket(
    ticket_id: int,
    _: AdminPrincipal,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
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
    _: AdminPrincipal,
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
    principal: AdminPrincipal,
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
    return admin_get_ticket(ticket_id, principal, db)


@router.get("/export/monthly.xlsx")
def admin_export_monthly(
    _: AdminPrincipal,
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
    filename = f"combustible_{period.year}_{period.month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Carga masiva administrativa (Drop Zone)
# ---------------------------------------------------------------------------

_BATCH_ALLOWED_IMAGE_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"},
)
_BATCH_MAX_FILES: int = 25
_BATCH_MAX_SEGMENTS_PER_FILE: int = 30


def _is_pdf(filename: str | None, content_type: str | None) -> bool:
    fname = (filename or "").lower()
    ctype = (content_type or "").lower()
    return ctype == "application/pdf" or fname.endswith(".pdf")


def _decompose_file_to_segments(
    raw: bytes,
    filename: str | None,
    content_type: str | None,
) -> tuple[list[bytes], list[str]]:
    """Devuelve (lista_segmentos_jpeg, errores_de_decodificación)."""
    errors: list[str] = []
    if not raw:
        errors.append("Archivo vacío.")
        return [], errors

    pages = []
    if _is_pdf(filename, content_type):
        try:
            pages = render_pdf_to_bgr(raw)
        except PdfRenderError as exc:
            errors.append(str(exc))
            return [], errors
    else:
        decoded = decode_image_bytes(raw)
        if decoded is None:
            errors.append("Formato de imagen no soportado o archivo corrupto.")
            return [], errors
        pages = [decoded]

    segments: list[bytes] = []
    for page in pages:
        for crop in segment_tickets(page):
            if len(segments) >= _BATCH_MAX_SEGMENTS_PER_FILE:
                errors.append(
                    f"Se truncaron los recortes en {_BATCH_MAX_SEGMENTS_PER_FILE} por seguridad.",
                )
                return segments, errors
            try:
                segments.append(encode_image_jpeg(crop, quality=88))
            except RuntimeError as exc:
                errors.append(f"No se pudo codificar un recorte: {exc}")
    return segments, errors


class BatchTicketResult(BaseModel):
    filename: str
    status: Literal["ok", "partial", "duplicate", "error"]
    tickets: list[dict[str, Any]] = Field(default_factory=list)
    duplicates: int = 0
    errors: list[str] = Field(default_factory=list)


class BatchSummary(BaseModel):
    files: int
    tickets_created: int
    duplicates: int
    errors: int


class BatchUploadResponse(BaseModel):
    summary: BatchSummary
    results: list[BatchTicketResult]


def _process_file_sync(
    raw: bytes,
    filename: str,
    content_type: str | None,
    *,
    db: Session,
    operator_name: str,
) -> BatchTicketResult:
    """Bloqueante: hace todo el pipeline (segmentación + Gemini + persistencia)."""
    result = BatchTicketResult(filename=filename, status="error")
    segments, decode_errors = _decompose_file_to_segments(raw, filename, content_type)
    result.errors.extend(decode_errors)

    if not segments:
        result.status = "error"
        if not result.errors:
            result.errors.append("No se encontraron tickets legibles en el archivo.")
        return result

    for segment_bytes in segments:
        outcome: IngestOutcome = ingest_ticket_image(
            segment_bytes,
            db=db,
            operator_name=operator_name,
            field_device_id=None,
            expected_patente=None,
            enforce_patente_match=False,
            auto_assign_vehicle=True,
        )
        if outcome.status == "created" and outcome.ticket_dict:
            result.tickets.append(outcome.ticket_dict)
        elif outcome.status == "duplicate":
            result.duplicates += 1
            if outcome.message:
                result.errors.append(outcome.message)
        else:
            result.errors.append(outcome.message or f"Fallo: {outcome.status}")

    if result.tickets and not result.errors and result.duplicates == 0:
        result.status = "ok"
    elif result.tickets:
        result.status = "partial"
    elif result.duplicates and not result.tickets:
        result.status = "duplicate"
    else:
        result.status = "error"
    return result


@router.post("/upload-batch", response_model=BatchUploadResponse)
async def admin_upload_batch(
    principal: AdminPrincipal,
    files: list[UploadFile] = File(..., description="Imágenes (JPEG/PNG/WebP) o PDFs con tickets."),
    db: Session = Depends(get_db),
) -> BatchUploadResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subí al menos un archivo.",
        )
    if len(files) > _BATCH_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Demasiados archivos en un solo lote (máximo {_BATCH_MAX_FILES}). Subilos en tandas.",
        )

    operator_name = f"Carga admin · {principal.username}"
    results: list[BatchTicketResult] = []

    for f in files:
        filename = f.filename or "archivo"
        ctype = (f.content_type or "").lower()
        if not _is_pdf(filename, ctype) and ctype and ctype not in _BATCH_ALLOWED_IMAGE_TYPES:
            results.append(
                BatchTicketResult(
                    filename=filename,
                    status="error",
                    errors=[f"Tipo de archivo no soportado: {ctype or 'desconocido'}."],
                ),
            )
            continue

        try:
            raw = await f.read()
        except Exception as exc:  # noqa: BLE001
            results.append(
                BatchTicketResult(
                    filename=filename,
                    status="error",
                    errors=[f"No se pudo leer el archivo: {exc}"],
                ),
            )
            continue

        try:
            r = await asyncio.to_thread(
                _process_file_sync,
                raw,
                filename,
                ctype,
                db=db,
                operator_name=operator_name,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Fallo en carga masiva del archivo %s", filename)
            r = BatchTicketResult(
                filename=filename,
                status="error",
                errors=[f"Error interno procesando el archivo: {exc}"],
            )
        results.append(r)

    summary = BatchSummary(
        files=len(results),
        tickets_created=sum(len(r.tickets) for r in results),
        duplicates=sum(r.duplicates for r in results),
        errors=sum(1 for r in results if r.status == "error"),
    )
    return BatchUploadResponse(summary=summary, results=results)
