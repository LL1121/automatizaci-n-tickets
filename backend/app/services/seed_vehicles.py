"""Semilla opcional de vehículos demo."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.vehicle import Vehicle

logger = logging.getLogger(__name__)

_DEMO_FLEET: tuple[tuple[str, float | None], ...] = (
    ("AB123CD", 80.0),
    ("XY987ZZ", 55.0),
    ("AA000BB", 70.0),
)


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
