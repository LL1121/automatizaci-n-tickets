"""Rendición tardía (48 h hábiles) y desvío de consumo vs esperado (Circular 08/2026)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.models.vehicle import Vehicle


def business_hours_between(start: datetime, end: datetime) -> float:
    """Horas transcurridas contando solo lunes–viernes (sin feriados)."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        return 0.0

    total = 0.0
    cursor = start
    while cursor < end:
        # Avanzar al siguiente día hábil si es fin de semana
        while cursor.weekday() >= 5:  # 5=sáb, 6=dom
            cursor = (cursor + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if cursor >= end:
                return total
        day_end = (cursor + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        segment_end = min(end, day_end)
        if cursor.weekday() < 5:
            total += (segment_end - cursor).total_seconds() / 3600.0
        cursor = day_end
    return total


def is_rendicion_tardia(
    fecha_ticket: datetime | None,
    ingested_at: datetime | None,
    *,
    max_business_hours: float = 48.0,
) -> bool:
    if fecha_ticket is None or ingested_at is None:
        return False
    return business_hours_between(fecha_ticket, ingested_at) > max_business_hours


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def reading_value(ticket: Ticket) -> float | None:
    """Lectura oficial: km_o_horas, o kilometraje de la IA como respaldo."""
    kmh = _as_float(ticket.km_o_horas)
    if kmh is not None:
        return kmh
    return _as_float(ticket.kilometraje)


def previous_ticket_reading(
    db: Session,
    *,
    vehicle_id: int,
    before_fecha: datetime | None,
    before_id: int | None = None,
) -> float | None:
    """Última lectura de la misma unidad anterior a este ticket."""
    if before_fecha is None and before_id is None:
        return None

    q = select(Ticket).where(Ticket.vehicle_id == vehicle_id)
    if before_fecha is not None:
        cond = Ticket.fecha < before_fecha
        if before_id is not None:
            cond = or_(
                Ticket.fecha < before_fecha,
                and_(Ticket.fecha == before_fecha, Ticket.id < before_id),
            )
        q = q.where(cond)
    elif before_id is not None:
        q = q.where(Ticket.id < before_id)

    q = q.order_by(Ticket.fecha.desc().nullslast(), Ticket.id.desc()).limit(1)
    prev = db.scalars(q).first()
    if prev is None:
        return None
    return reading_value(prev)


def compute_desvio(
    *,
    litros: float | None,
    lectura_final: float | None,
    lectura_inicio: float | None,
    consumo_esperado: float | None,
    unidad_consumo: str | None,
    umbral_desvio: float = 0.15,
) -> tuple[bool, float | None]:
    """
    Compara consumo real vs esperado.
    Devuelve (desvio_detectado, desvio_pct) donde desvio_pct es
    (real - esperado) / esperado (ej. 0.20 = 20% por encima).
    """
    if (
        litros is None
        or litros <= 0
        or lectura_final is None
        or lectura_inicio is None
        or consumo_esperado is None
        or consumo_esperado <= 0
    ):
        return False, None

    delta = lectura_final - lectura_inicio
    if delta <= 0:
        return False, None

    unidad = (unidad_consumo or "l_100km").strip().lower()
    if unidad == "l_hora":
        real = litros / delta
    else:
        # l_100km
        real = (litros / delta) * 100.0

    ratio = (real - consumo_esperado) / consumo_esperado
    if ratio > umbral_desvio:
        return True, ratio
    return False, ratio if ratio > 0 else ratio


def apply_ticket_flags(db: Session, ticket: Ticket, vehicle: Vehicle | None = None) -> None:
    """Recalcula rendicion_tardia y desvio_* sobre el ticket (in-place, sin commit)."""
    ticket.rendicion_tardia = is_rendicion_tardia(ticket.fecha, ticket.ingested_at)

    veh = vehicle
    if veh is None and ticket.vehicle_id is not None:
        veh = db.get(Vehicle, ticket.vehicle_id)

    litros = _as_float(ticket.litros)
    final = reading_value(ticket)
    inicio = None
    if ticket.vehicle_id is not None:
        inicio = previous_ticket_reading(
            db,
            vehicle_id=ticket.vehicle_id,
            before_fecha=ticket.fecha,
            before_id=ticket.id if ticket.id else None,
        )

    if veh is None:
        ticket.desvio_detectado = False
        ticket.desvio_pct = None
        return

    desvio, pct = compute_desvio(
        litros=litros,
        lectura_final=final,
        lectura_inicio=inicio,
        consumo_esperado=veh.consumo_esperado,
        unidad_consumo=veh.unidad_consumo,
        umbral_desvio=float(veh.umbral_desvio if veh.umbral_desvio is not None else 0.15),
    )
    ticket.desvio_detectado = desvio
    ticket.desvio_pct = pct


def sync_km_o_horas_from_kilometraje(ticket: Ticket) -> None:
    """Si km_o_horas está vacío y hay kilometraje IA, copiarlo."""
    if ticket.km_o_horas is None and ticket.kilometraje is not None:
        ticket.km_o_horas = Decimal(str(ticket.kilometraje))
