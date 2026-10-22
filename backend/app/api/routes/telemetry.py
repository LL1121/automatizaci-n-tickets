"""Telemetría en vivo de Pressa. El JWT es el del panel: la respuesta trae ubicación."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import AdminPrincipal
from app.db.session import get_db
from app.services.pressa_client import PressaError
from app.services.telemetry import (
    ensure_fresh_telemetry,
    fleet_payload,
    has_any_snapshot,
    vehicle_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telemetry", tags=["telemetry"])


@router.get("/fleet")
async def telemetry_fleet(
    _principal: AdminPrincipal,
    db: Session = Depends(get_db),
) -> dict:
    await _refresh_or_cache(db)
    return {"vehicles": fleet_payload(db)}


@router.get("/vehicle/{plate}")
async def telemetry_vehicle(
    plate: str,
    _principal: AdminPrincipal,
    db: Session = Depends(get_db),
) -> dict:
    await _refresh_or_cache(db)
    payload = vehicle_payload(db, plate)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Esa patente no está en la flota.")
    if payload["recorded_at"] is None and not has_any_snapshot(db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pressa no respondió y no hay una lectura guardada de ese móvil.",
        )
    return payload


async def _refresh_or_cache(db: Session) -> None:
    try:
        await ensure_fresh_telemetry(db)
    except PressaError:
        logger.exception("Pressa no respondió")
        if not has_any_snapshot(db):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Pressa no respondió y no hay lecturas guardadas.",
            ) from None
