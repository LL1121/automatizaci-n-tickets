"""Caché de 10 minutos de la flota Pressa y cruce con el ticket."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.telemetry import TelemetrySnapshot
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle, es_unidad_horas
from app.services.consumption import previous_ticket_reading, reading_value
from app.services.plate import format_patente_display, normalize_patente
from app.services.pressa_client import PressaError, get_pressa_client
from app.services.seed_vehicles import fleet_storage_key

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(minutes=10)
SALTO_MAXIMO = 1500
_PLATE_KEYS = (
    "domain",
    "dominio",
    "patente",
    "plate",
    "placa",
    "name",
    "vehicleName",
    "alias",
    "registration",
)
_logged_shape = False
_unmatched_domains: set[str] = set()


def cache_is_fresh(db: Session) -> bool:
    latest = db.scalar(select(func.max(TelemetrySnapshot.recorded_at)))
    if latest is None:
        return False
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - latest < CACHE_TTL


async def ensure_fresh_telemetry(db: Session) -> None:
    """Consulta Pressa si la última lectura tiene 10 minutos o más."""
    if cache_is_fresh(db):
        return
    items = await get_pressa_client().fetch_vehicles()
    _store_snapshots(db, items)
    db.commit()


async def refresh_telemetry_quietly(db: Session) -> None:
    """La carga del ticket sigue aunque Pressa no responda."""
    try:
        await ensure_fresh_telemetry(db)
    except PressaError:
        logger.exception("Pressa no respondió; la carga sigue sin lectura en vivo")


def fleet_payload(db: Session) -> list[dict[str, Any]]:
    latest = _latest_by_vehicle(db)
    rows: list[dict[str, Any]] = []
    for vehicle in db.scalars(select(Vehicle).order_by(Vehicle.patente)).all():
        rows.append(_vehicle_payload(vehicle, latest.get(vehicle.id)))
    return rows


def vehicle_payload(db: Session, plate: str) -> dict[str, Any] | None:
    vehicle = find_vehicle(db, plate)
    if vehicle is None:
        return None
    latest = _latest_by_vehicle(db)
    return _vehicle_payload(vehicle, latest.get(vehicle.id))


def find_vehicle(db: Session, plate: str) -> Vehicle | None:
    key = fleet_storage_key(plate)
    if not key:
        return None
    for vehicle in db.scalars(select(Vehicle)).all():
        if fleet_storage_key(vehicle.patente) == key:
            return vehicle
    return None


def has_any_snapshot(db: Session) -> bool:
    return db.scalar(select(func.count()).select_from(TelemetrySnapshot)) not in (None, 0)


def apply_telemetry_flags(db: Session, ticket: Ticket) -> None:
    """Marca tanque excedido y desfasaje de odómetro u horómetro. No llama a Pressa."""
    ticket.alerta_tanque = False
    ticket.alerta_telemetria = False
    if ticket.vehicle_id is None:
        return
    vehicle = ticket.vehicle or db.get(Vehicle, ticket.vehicle_id)
    if vehicle is None:
        return

    litros = _as_float(ticket.litros)
    if (
        litros is not None
        and vehicle.capacidad_tanque is not None
        and litros > float(vehicle.capacidad_tanque)
    ):
        ticket.alerta_tanque = True

    lectura = reading_value(ticket)
    if lectura is None:
        return
    previa = previous_ticket_reading(
        db,
        vehicle_id=ticket.vehicle_id,
        before_fecha=ticket.fecha,
        before_id=ticket.id if ticket.id else None,
    )
    if previa is not None:
        delta = lectura - previa
        if delta < 0 or delta > SALTO_MAXIMO:
            ticket.alerta_telemetria = True

    board = _pressa_cerca(db, ticket, vehicle)
    if board is not None and abs(lectura - board) > SALTO_MAXIMO:
        ticket.alerta_telemetria = True


def _store_snapshots(db: Session, items: list[dict[str, Any]]) -> None:
    index = _vehicle_index(db)
    now = datetime.now(timezone.utc)
    seen: set[int] = set()
    for item in items:
        parsed = _parse_item(item)
        domain = parsed["domain"]
        vehicle = index.get(normalize_patente(domain)) if domain else None
        if vehicle is None:
            if domain and domain not in _unmatched_domains:
                _unmatched_domains.add(domain)
                logger.warning("Pressa: dominio sin móvil en el padrón: %s", domain)
            continue
        if vehicle.id in seen:
            continue
        seen.add(vehicle.id)
        horas = parsed["horas"] if es_unidad_horas(vehicle.unidad_medida, vehicle.unidad_consumo) else None
        db.add(
            TelemetrySnapshot(
                vehicle_id=vehicle.id,
                recorded_at=now,
                odometer_km=parsed["km"],
                engine_hours=horas,
                liters=parsed["litros"],
                lat=parsed["lat"],
                lng=parsed["lng"],
                event_description=(parsed["evento"] or None),
                event_timestamp=parsed["event_timestamp"],
            )
        )


def _vehicle_index(db: Session) -> dict[str, Vehicle]:
    index: dict[str, Vehicle] = {}
    for vehicle in db.scalars(select(Vehicle)).all():
        if vehicle.dominio_pressa:
            index[normalize_patente(vehicle.dominio_pressa)] = vehicle
        index.setdefault(normalize_patente(vehicle.patente), vehicle)
    return index


def _parse_item(item: dict[str, Any]) -> dict[str, Any]:
    global _logged_shape
    has_odo = item.get("adjustOdometer") is not None or item.get("odometer") is not None
    adjust = _as_float(item.get("adjustOdometer")) or 0.0
    odometer = _as_float(item.get("odometer")) or 0.0
    event = item.get("currEventCode")
    if not isinstance(event, dict):
        event = {}
    domain = _extract_domain(item)
    if not domain and not _logged_shape:
        _logged_shape = True
        logger.info("Pressa: claves del vehículo: %s", ", ".join(sorted(item.keys())))
    description = event.get("description")
    return {
        "domain": domain,
        "km": round(adjust + odometer) if has_odo else None,
        "horas": _as_float(item.get("adjHours")),
        "litros": _as_float(item.get("liters")),
        "lat": _as_float(item.get("lat")),
        "lng": _as_float(item.get("lng")),
        "evento": str(description)[:160] if description else None,
        "event_timestamp": _event_timestamp(event.get("timestamp")),
    }


def _extract_domain(item: dict[str, Any]) -> str:
    for key in _PLATE_KEYS:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for key, value in item.items():
        if not isinstance(value, str) or not value.strip():
            continue
        low = key.lower()
        if "dom" in low or "pat" in low or "plate" in low:
            return value.strip()
    return ""


def _event_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:40] or None


def _latest_by_vehicle(db: Session) -> dict[int, TelemetrySnapshot]:
    rows = db.scalars(
        select(TelemetrySnapshot)
        .distinct(TelemetrySnapshot.vehicle_id)
        .order_by(TelemetrySnapshot.vehicle_id, TelemetrySnapshot.recorded_at.desc())
    ).all()
    return {row.vehicle_id: row for row in rows}


def _vehicle_payload(vehicle: Vehicle, snap: TelemetrySnapshot | None) -> dict[str, Any]:
    horas = None
    if snap is not None and es_unidad_horas(vehicle.unidad_medida, vehicle.unidad_consumo):
        horas = snap.engine_hours
    timestamp = None
    recorded_at = None
    if snap is not None:
        timestamp = snap.event_timestamp or snap.recorded_at.isoformat()
        recorded_at = snap.recorded_at.isoformat()
    return {
        "patente": format_patente_display(vehicle.patente),
        "alias": vehicle.alias,
        "unidad_medida": vehicle.unidad_medida,
        "km": snap.odometer_km if snap is not None else None,
        "horas": horas,
        "litros": snap.liters if snap is not None else None,
        "lat": snap.lat if snap is not None else None,
        "lng": snap.lng if snap is not None else None,
        "timestamp": timestamp,
        "evento": snap.event_description if snap is not None else None,
        "recorded_at": recorded_at,
    }


def _pressa_cerca(db: Session, ticket: Ticket, vehicle: Vehicle) -> float | None:
    moment = ticket.fecha
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    snap = db.scalars(
        select(TelemetrySnapshot)
        .where(
            TelemetrySnapshot.vehicle_id == vehicle.id,
            TelemetrySnapshot.recorded_at >= moment - CACHE_TTL,
            TelemetrySnapshot.recorded_at <= moment + CACHE_TTL,
        )
        .order_by(func.abs(func.extract("epoch", TelemetrySnapshot.recorded_at - moment)))
        .limit(1)
    ).first()
    if snap is None:
        return None
    if es_unidad_horas(vehicle.unidad_medida, vehicle.unidad_consumo):
        return snap.engine_hours
    if snap.odometer_km is None:
        return None
    return float(snap.odometer_km)


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
