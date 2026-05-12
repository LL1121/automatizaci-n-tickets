"""Listado de vehículos para operadores de campo."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.vehicle import Vehicle

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("/")
def list_vehicles(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Vehicle).order_by(Vehicle.patente)).all()
    return [
        {
            "id": v.id,
            "patente": v.patente,
            "capacidad_tanque": v.capacidad_tanque,
        }
        for v in rows
    ]
