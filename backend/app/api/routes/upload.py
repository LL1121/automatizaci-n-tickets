"""Endpoint de ingesta: imagen → OpenCV → Gemini → persistencia con anti-duplicados."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.circular import ACTIVIDAD_SET
from app.db.session import get_db
from app.models.field_device import FieldDevice
from app.models.vehicle import Vehicle
from app.services.ticket_ingest import ingest_ticket_image

router = APIRouter(tags=["ingest"])

_ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
    }
)


def _resolve_field_device(db: Session, device_uid: str | None) -> FieldDevice:
    uid = (device_uid or "").strip()
    if len(uid) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="device_uid requerido (identificador del celular). Registrá el operario en la app.",
        )
    device = db.scalar(select(FieldDevice).where(FieldDevice.device_uid == uid))
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dispositivo no registrado. Ingresá tu nombre en la pantalla inicial.",
        )
    device.last_seen_at = datetime.now(timezone.utc)
    return device


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_ticket(
    file: UploadFile = File(..., description="Imagen del ticket (JPEG/PNG/WebP)"),
    vehicle_id: Annotated[int | None, Form(description="Vehículo asociado (opcional)")] = None,
    device_uid: Annotated[str | None, Form(description="Identificador del dispositivo de campo")] = None,
    legajo_conductor: Annotated[str | None, Form()] = None,
    nombre_conductor: Annotated[str | None, Form()] = None,
    tipo_actividad: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
) -> dict:
    field_device = _resolve_field_device(db, device_uid)

    resolved_vehicle_id: int | None = vehicle_id
    vehicle_patente: str | None = None
    if resolved_vehicle_id is not None:
        vehicle = db.scalar(select(Vehicle).where(Vehicle.id == resolved_vehicle_id))
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="vehicle_id no corresponde a un vehículo existente.",
            )
        vehicle_patente = vehicle.patente

    actividad = (tipo_actividad or "").strip()
    if actividad and actividad not in ACTIVIDAD_SET:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"tipo_actividad inválido. Opciones: {', '.join(sorted(ACTIVIDAD_SET))}",
        )
    if not (legajo_conductor or "").strip() or not (nombre_conductor or "").strip() or not actividad:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Completá legajo, nombre del conductor y tipo de actividad (Circular 08/2026).",
        )

    ct = file.content_type
    if ct is None or ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Tipo de archivo no soportado. Usá JPEG, PNG o WebP.",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")

    outcome = ingest_ticket_image(
        raw_bytes,
        db=db,
        operator_name=field_device.nombre,
        field_device_id=field_device.id,
        expected_patente=vehicle_patente,
        enforce_patente_match=True,
        auto_assign_vehicle=False,
        vehicle_id=resolved_vehicle_id,
        legajo_conductor=legajo_conductor,
        nombre_conductor=nombre_conductor,
        tipo_actividad=actividad,
    )

    if outcome.status == "created" and outcome.ticket_dict:
        return outcome.ticket_dict

    raise HTTPException(
        status_code=outcome.http_status or status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=outcome.message or "No se pudo registrar el ticket.",
    )
