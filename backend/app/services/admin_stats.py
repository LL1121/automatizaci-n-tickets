"""Consultas agregadas para el panel de administración."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, and_, case, func, select
from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.models.vehicle import Vehicle


def _json_float(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, Decimal):
        return float(x)
    return float(x)


def _json_int(x: Any) -> int:
    if x is None:
        return 0
    if isinstance(x, Decimal):
        return int(x)
    return int(x)


def _month_bounds_utc(year: int, month: int) -> tuple[datetime, datetime]:
    if not (1 <= month <= 12):
        raise ValueError("month must be 1-12")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    last = monthrange(year, month)[1]
    end = datetime(year, month, last, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start, end


def effective_ticket_datetime() -> Any:
    """COALESCE(fecha ticket, fecha de ingesta) para reportes por período."""
    return func.coalesce(Ticket.fecha, Ticket.ingested_at)


@dataclass(frozen=True)
class MonthPeriod:
    year: int
    month: int
    start_utc: datetime
    end_utc: datetime


def resolve_period(year: int | None, month: int | None) -> MonthPeriod:
    now = datetime.now(timezone.utc)
    y = year if year is not None else now.year
    m = month if month is not None else now.month
    start, end = _month_bounds_utc(y, m)
    return MonthPeriod(year=y, month=m, start_utc=start, end_utc=end)


def summary_for_month(db: Session, period: MonthPeriod) -> dict[str, Any]:
    eff = effective_ticket_datetime()
    q = select(
        func.coalesce(func.sum(Ticket.litros), 0),
        func.coalesce(func.sum(Ticket.kilometraje), 0),
        func.count(Ticket.id),
    ).where(and_(eff >= period.start_utc, eff <= period.end_utc))

    litros, km_sum, n = db.execute(q).one()
    return {
        "year": period.year,
        "month": period.month,
        "total_litros": _json_float(litros),
        "total_kilometraje": _json_int(km_sum),
        "cantidad_cargas": _json_int(n),
    }


def liters_by_vehicle_month(db: Session, period: MonthPeriod) -> list[dict[str, Any]]:
    """Litros agrupados por patente (tickets sin vehículo van a patente '—')."""
    eff = effective_ticket_datetime()
    patente_expr = case((Ticket.vehicle_id.is_(None), "—"), else_=Vehicle.patente)
    vid = case((Ticket.vehicle_id.is_(None), 0), else_=Vehicle.id)

    q = (
        select(
            vid.label("vehicle_id"),
            patente_expr.label("patente"),
            func.coalesce(func.sum(Ticket.litros), 0).label("total_litros"),
            func.count(Ticket.id).label("cantidad_cargas"),
        )
        .select_from(Ticket)
        .outerjoin(Vehicle, Vehicle.id == Ticket.vehicle_id)
        .where(and_(eff >= period.start_utc, eff <= period.end_utc))
        .group_by(vid, patente_expr)
        .order_by(func.coalesce(func.sum(Ticket.litros), 0).desc().nulls_last())
    )
    rows = db.execute(q).all()
    return [
        {
            "vehicle_id": _json_int(r.vehicle_id) if r.vehicle_id is not None else None,
            "patente": r.patente,
            "total_litros": _json_float(r.total_litros),
            "cantidad_cargas": _json_int(r.cantidad_cargas),
        }
        for r in rows
    ]


def tickets_query_filtered(
    *,
    from_date: datetime | None,
    to_date: datetime | None,
    vehicle_id: int | None,
    min_confidence: float | None,
    max_confidence: float | None,
    is_verified: bool | None,
) -> Select[Any]:
    eff = effective_ticket_datetime()
    q = (
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
    )
    conds: list[Any] = []
    if from_date is not None:
        conds.append(eff >= from_date)
    if to_date is not None:
        conds.append(eff <= to_date)
    if vehicle_id is not None:
        conds.append(Ticket.vehicle_id == vehicle_id)
    if min_confidence is not None:
        conds.append(and_(Ticket.confidence_score.is_not(None), Ticket.confidence_score >= min_confidence))
    if max_confidence is not None:
        conds.append(and_(Ticket.confidence_score.is_not(None), Ticket.confidence_score <= max_confidence))
    if is_verified is not None:
        conds.append(Ticket.is_verified.is_(is_verified))
    if conds:
        q = q.where(and_(*conds))
    return q


def count_tickets_filtered(
    *,
    from_date: datetime | None,
    to_date: datetime | None,
    vehicle_id: int | None,
    min_confidence: float | None,
    max_confidence: float | None,
    is_verified: bool | None,
) -> Select[Any]:
    base = tickets_query_filtered(
        from_date=from_date,
        to_date=to_date,
        vehicle_id=vehicle_id,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        is_verified=is_verified,
    ).subquery()
    return select(func.count()).select_from(base)


def tickets_for_export(
    db: Session,
    period: MonthPeriod,
) -> list[dict[str, Any]]:
    eff = effective_ticket_datetime()
    q = (
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
            Ticket.confidence_score,
            Ticket.is_verified,
            Vehicle.patente,
        )
        .select_from(Ticket)
        .outerjoin(Vehicle, Vehicle.id == Ticket.vehicle_id)
        .where(and_(eff >= period.start_utc, eff <= period.end_utc))
        .order_by(Ticket.id)
    )
    rows = db.execute(q).mappings().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "patente": r["patente"] or "",
                "cuit_proveedor": r["cuit_proveedor"],
                "nro_ticket": r["nro_ticket"],
                "litros": float(r["litros"]) if r["litros"] is not None else None,
                "kilometraje": r["kilometraje"],
                "tipo_combustible": r["tipo_combustible"],
                "remito": r["remito"],
                "operador_nombre": r["operador_nombre"],
                "fecha": r["fecha"].isoformat() if r["fecha"] else None,
                "ingested_at": r["ingested_at"].isoformat() if r["ingested_at"] else None,
                "confidence_score": r["confidence_score"],
                "is_verified": r["is_verified"],
            }
        )
    return out
