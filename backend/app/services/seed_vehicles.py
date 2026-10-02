"""Semilla y alta idempotente de vehículos de la flota."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.vehicle import Vehicle
from app.services.plate import normalize_patente

logger = logging.getLogger(__name__)

_DEMO_FLEET: tuple[tuple[str, float | None], ...] = (
    ("AB123CD", 80.0),
    ("XY987ZZ", 55.0),
    ("AA000BB", 70.0),
)

# Patentes reales. Se guardan normalizadas (sin espacios) para cruzar con el ticket.
# Se insertan al arrancar el API. Capacidad de tanque en litros, o None si no se conoce.
FLEET_PATENTES: tuple[tuple[str, float | None], ...] = (
    ("AC979ML", 70.0),
    ("EVF245", None),
)


def ensure_fleet_vehicles(db: Session) -> list[str]:
    """Inserta patentes de la flota que aún no estén en la base. Devuelve las agregadas."""
    existing = {
        normalize_patente(v.patente): v
        for v in db.scalars(select(Vehicle)).all()
    }
    added: list[str] = []
    changed = False
    for raw, cap in FLEET_PATENTES:
        patente = normalize_patente(raw)
        if not patente:
            continue
        current = existing.get(patente)
        if current is not None:
            if current.patente != patente:
                current.patente = patente
                changed = True
            continue
        db.add(Vehicle(patente=patente, capacidad_tanque=cap))
        added.append(patente)
    if added or changed:
        db.commit()
        if added:
            logger.info("Flota: agregadas %d patente(s) nueva(s): %s", len(added), ", ".join(added))
    return added


def seed_demo_vehicles_if_configured(db: Session) -> None:
    settings = get_settings()
    if not settings.seed_demo_vehicles_if_empty:
        return
    count = db.scalar(select(func.count()).select_from(Vehicle))
    if count and count > 0:
        return
    for patente, cap in _DEMO_FLEET:
        db.add(Vehicle(patente=patente, capacidad_tanque=cap))
    db.commit()
    logger.info("Semilla: insertados %d vehículos demo (FUEL_OPS_SEED_VEHICLES).", len(_DEMO_FLEET))
