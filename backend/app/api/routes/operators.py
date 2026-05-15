"""Registro de operarios por dispositivo de campo."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.field_device import FieldDevice

router = APIRouter(prefix="/operators", tags=["operators"])


class OperatorRegisterBody(BaseModel):
    device_uid: str = Field(..., min_length=8, max_length=128)
    nombre: str = Field(..., min_length=2, max_length=120)


def _operator_payload(device: FieldDevice) -> dict:
    return {
        "id": device.id,
        "device_uid": device.device_uid,
        "nombre": device.nombre,
        "created_at": device.created_at.isoformat() if device.created_at else None,
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
    }


@router.get("/device/{device_uid}")
def get_operator_by_device(device_uid: str, db: Session = Depends(get_db)) -> dict:
    uid = device_uid.strip()
    if len(uid) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_uid inválido.")
    device = db.scalar(select(FieldDevice).where(FieldDevice.device_uid == uid))
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo no registrado.")
    return _operator_payload(device)


@router.post("/register", status_code=status.HTTP_200_OK)
def register_operator(body: OperatorRegisterBody, db: Session = Depends(get_db)) -> dict:
    uid = body.device_uid.strip()
    nombre = body.nombre.strip()
    now = datetime.now(timezone.utc)

    device = db.scalar(select(FieldDevice).where(FieldDevice.device_uid == uid))
    if device is None:
        device = FieldDevice(device_uid=uid, nombre=nombre, last_seen_at=now)
        db.add(device)
    else:
        device.nombre = nombre
        device.last_seen_at = now

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo registrar el operario.",
        ) from None

    db.refresh(device)
    return _operator_payload(device)
