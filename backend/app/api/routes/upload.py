"""Endpoint de ingesta: imagen → OpenCV → Gemini → persistencia con anti-duplicados."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.field_device import TIPO_COMBUSTIBLE_DEFAULT, FieldDevice
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle
from app.services.ai_engine import (
    AIEngineError,
    AIExtractionIncompleteError,
    AIQuotaExceededError,
    extract_ticket_from_image,
)
from app.services.image_preprocess import ImagePreprocessError, preprocess_for_vision
from app.services.plate import normalize_patente, patentes_coinciden

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ingest"])

_ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
    }
)


def _normalize_cuit(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    return digits[:32] if digits else raw.strip()


def _normalize_nro_ticket(raw: str) -> str:
    return re.sub(r"\s+", "", raw).strip()[:64]


def _normalize_remito(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"\s+", "", str(raw).strip())
    return cleaned[:64] if cleaned else None


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


def _parse_fecha(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        pass

    m = re.match(
        r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$",
        text,
    )
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        hour = int(m.group(4) or 0)
        minute = int(m.group(5) or 0)
        second = int(m.group(6) or 0)
        try:
            return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
        except ValueError:
            logger.info("Fecha IA con componentes inválidos: %s", value)
            return None

    logger.info("Fecha IA no parseable: %s", value)
    return None


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_ticket(
    file: UploadFile = File(..., description="Imagen del ticket (JPEG/PNG/WebP)"),
    vehicle_id: Annotated[int | None, Form(description="Vehículo asociado (opcional)")] = None,
    device_uid: Annotated[str | None, Form(description="Identificador del dispositivo de campo")] = None,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
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

    ct = file.content_type
    if ct is None or ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Tipo de archivo no soportado. Usá JPEG, PNG o WebP.",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")

    try:
        processed_png = preprocess_for_vision(raw_bytes)
    except ImagePreprocessError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        extracted = extract_ticket_from_image(
            processed_png,
            expected_patente=vehicle_patente,
        )
    except AIExtractionIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except AIQuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except AIEngineError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    cuit = _normalize_cuit(extracted.cuit_proveedor)
    nro = _normalize_nro_ticket(extracted.nro_ticket)
    patente_leida = normalize_patente(extracted.patente)
    if not cuit or not nro or not patente_leida:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La IA no devolvió CUIT, número de ticket o patente suficientes para registrar el comprobante.",
        )

    if vehicle_patente is not None and not patentes_coinciden(vehicle_patente, extracted.patente):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"La patente del ticket ({normalize_patente(extracted.patente)}) no coincide con la seleccionada "
                f"({normalize_patente(vehicle_patente)}). Elegí el vehículo correcto o volvé a capturar."
            ),
        )

    fecha_ticket = _parse_fecha(extracted.fecha)
    if fecha_ticket is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No se pudo leer la fecha del ticket (buscá que se vea «Fecha Impresion»). "
                "Mejorá la foto y volvé a capturar."
            ),
        )

    existing = db.scalar(
        select(Ticket.id).where(
            Ticket.cuit_proveedor == cuit,
            Ticket.nro_ticket == nro,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un ticket con el mismo CUIT de proveedor y número de ticket.",
        )

    upload_root: Path = settings.upload_dir
    upload_root.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4().hex
    dest = upload_root / f"{file_id}.png"
    try:
        dest.write_bytes(processed_png)
    except OSError as exc:
        logger.exception("No se pudo guardar la imagen en disco")
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="No se pudo almacenar la imagen procesada.",
        ) from exc

    url_imagen = str(dest.resolve())

    ticket = Ticket(
        cuit_proveedor=cuit,
        nro_ticket=nro,
        litros=Decimal(str(extracted.litros)) if extracted.litros is not None else None,
        kilometraje=extracted.kilometraje,
        tipo_combustible=TIPO_COMBUSTIBLE_DEFAULT,
        remito=_normalize_remito(extracted.remito),
        fecha=fecha_ticket,
        url_imagen=url_imagen,
        confidence_score=extracted.confidence_score,
        vehicle_id=resolved_vehicle_id,
        field_device_id=field_device.id,
        operador_nombre=field_device.nombre,
        ingested_at=datetime.now(timezone.utc),
    )
    db.add(ticket)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            logger.warning("No se pudo borrar archivo huérfano tras fallo de unicidad: %s", dest)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El ticket ya fue registrado (violación de unicidad).",
        ) from None
    except Exception:
        db.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            logger.warning("No se pudo borrar archivo huérfano tras error DB: %s", dest)
        logger.exception("Error al persistir el ticket")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al guardar el ticket en la base de datos.",
        ) from None

    db.refresh(ticket)
    return {
        "id": ticket.id,
        "cuit_proveedor": ticket.cuit_proveedor,
        "nro_ticket": ticket.nro_ticket,
        "litros": float(ticket.litros) if ticket.litros is not None else None,
        "kilometraje": ticket.kilometraje,
        "tipo_combustible": ticket.tipo_combustible,
        "remito": ticket.remito,
        "operador_nombre": ticket.operador_nombre,
        "fecha": ticket.fecha.isoformat() if ticket.fecha else None,
        "url_imagen": ticket.url_imagen,
        "confidence_score": ticket.confidence_score,
        "vehicle_id": ticket.vehicle_id,
        "patente_leida": patente_leida,
        "is_verified": ticket.is_verified,
        "ingested_at": ticket.ingested_at.isoformat() if ticket.ingested_at else None,
    }
