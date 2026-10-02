"""Pipeline compartido para procesar y persistir un ticket a partir de bytes de imagen.

Lo usan los endpoints `/upload` (campo) y `/admin/upload-batch` (oficina).
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.field_device import TIPO_COMBUSTIBLE_DEFAULT
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle
from app.services.ai_engine import (
    AIEngineError,
    AIExtractionIncompleteError,
    AIQuotaExceededError,
    extract_ticket_from_image,
)
from app.services.consumption import apply_ticket_flags, sync_km_o_horas_from_kilometraje
from app.services.image_preprocess import ImagePreprocessError, preprocess_for_vision
from app.services.plate import format_patente_display, normalize_patente, patentes_coinciden

logger = logging.getLogger(__name__)

VEHICLE_NOT_FOUND = (
    "No encontramos la patente de ese vehículo. "
    "Volvé a elegirla en la lista: puede que no esté cargada "
    "o que el celular tenga un dato viejo."
)


def _mentions_vehicle_column(exc: BaseException) -> bool:
    text = str(getattr(exc, "orig", exc)).lower()
    return "vehicle_id" in text or "vehiculo_id" in text


IngestStatus = Literal["created", "duplicate", "incomplete", "quota", "ai_error", "preprocess_error", "validation_error"]


@dataclass(slots=True)
class IngestOutcome:
    status: IngestStatus
    ticket_dict: dict | None = None
    message: str | None = None
    http_status: int = 200


def _normalize_cuit(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    return digits[:32] if digits else raw.strip()


def _normalize_nro_ticket(raw: str) -> str:
    return re.sub(r"\s+", "", raw).strip()[:64]


def _normalize_tipo_combustible(raw: str | None) -> str:
    cleaned = " ".join(str(raw or "").split()).upper()
    return cleaned[:64] if cleaned else TIPO_COMBUSTIBLE_DEFAULT


def _normalize_remito(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"\s+", "", str(raw).strip())
    return cleaned[:64] if cleaned else None


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
        try:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            hour = int(m.group(4) or 0)
            minute = int(m.group(5) or 0)
            second = int(m.group(6) or 0)
            return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _ticket_to_dict(ticket: Ticket, *, patente_leida: str | None) -> dict:
    return {
        "id": ticket.id,
        "cuit_proveedor": ticket.cuit_proveedor,
        "nro_ticket": ticket.nro_ticket,
        "litros": float(ticket.litros) if ticket.litros is not None else None,
        "kilometraje": ticket.kilometraje,
        "km_o_horas": float(ticket.km_o_horas) if ticket.km_o_horas is not None else None,
        "tipo_combustible": ticket.tipo_combustible,
        "remito": ticket.remito,
        "operador_nombre": ticket.operador_nombre,
        "legajo_conductor": ticket.legajo_conductor,
        "nombre_conductor": ticket.nombre_conductor,
        "tipo_actividad": ticket.tipo_actividad,
        "estacion_servicio": ticket.estacion_servicio,
        "monto": float(ticket.monto) if ticket.monto is not None else None,
        "rendicion_tardia": bool(ticket.rendicion_tardia),
        "desvio_detectado": bool(ticket.desvio_detectado),
        "desvio_pct": ticket.desvio_pct,
        "fecha": ticket.fecha.isoformat() if ticket.fecha else None,
        "url_imagen": ticket.url_imagen,
        "confidence_score": ticket.confidence_score,
        "vehicle_id": ticket.vehicle_id,
        "patente_leida": patente_leida,
        "is_verified": ticket.is_verified,
        "ingested_at": ticket.ingested_at.isoformat() if ticket.ingested_at else None,
    }


def ingest_ticket_image(
    raw_bytes: bytes,
    *,
    db: Session,
    operator_name: str | None,
    field_device_id: int | None,
    expected_patente: str | None = None,
    enforce_patente_match: bool = False,
    auto_assign_vehicle: bool = True,
    vehicle_id: int | None = None,
    legajo_conductor: str | None = None,
    nombre_conductor: str | None = None,
    tipo_actividad: str | None = None,
) -> IngestOutcome:
    """Procesa una imagen y la persiste como ticket; devuelve outcome con detalle."""
    settings = get_settings()

    if not raw_bytes:
        return IngestOutcome(status="preprocess_error", message="Archivo vacío.", http_status=400)

    try:
        processed = preprocess_for_vision(raw_bytes)
    except ImagePreprocessError as exc:
        return IngestOutcome(status="preprocess_error", message=str(exc), http_status=400)

    try:
        extracted = extract_ticket_from_image(processed, expected_patente=expected_patente)
    except AIExtractionIncompleteError as exc:
        return IngestOutcome(status="incomplete", message=str(exc), http_status=422)
    except AIQuotaExceededError as exc:
        return IngestOutcome(status="quota", message=str(exc), http_status=429)
    except AIEngineError as exc:
        return IngestOutcome(status="ai_error", message=str(exc), http_status=502)

    cuit = _normalize_cuit(extracted.cuit_proveedor)
    nro = _normalize_nro_ticket(extracted.nro_ticket)
    patente_leida = normalize_patente(extracted.patente)
    if not cuit or not nro or not patente_leida:
        return IngestOutcome(
            status="incomplete",
            message="La IA no devolvió CUIT, número de ticket o patente suficientes para registrar el comprobante.",
            http_status=422,
        )

    if enforce_patente_match and expected_patente is not None and not patentes_coinciden(
        expected_patente, extracted.patente
    ):
        return IngestOutcome(
            status="validation_error",
            message=(
                f"La patente del ticket ({format_patente_display(patente_leida)}) "
                f"no coincide con la seleccionada ({format_patente_display(expected_patente)})."
            ),
            http_status=422,
        )

    fecha_ticket = _parse_fecha(extracted.fecha)
    if fecha_ticket is None:
        return IngestOutcome(
            status="incomplete",
            message=(
                "No se pudo leer la fecha del ticket (buscá «Fecha Impresion» al pie). "
                "Mejorá la foto o el escaneo y volvé a intentar."
            ),
            http_status=422,
        )

    existing = db.scalar(
        select(Ticket.id).where(
            Ticket.cuit_proveedor == cuit,
            Ticket.nro_ticket == nro,
        )
    )
    if existing is not None:
        return IngestOutcome(
            status="duplicate",
            message=f"Ticket duplicado (ya existe el comprobante {nro} del CUIT {cuit}).",
            http_status=409,
        )

    resolved_vehicle_id: int | None = vehicle_id
    if resolved_vehicle_id is None and auto_assign_vehicle and patente_leida:
        match = db.scalar(select(Vehicle).where(Vehicle.patente == patente_leida))
        if match is None:
            for candidate in db.scalars(select(Vehicle)).all():
                if normalize_patente(candidate.patente) == patente_leida:
                    match = candidate
                    break
        if match is not None:
            resolved_vehicle_id = match.id

    upload_root: Path = settings.upload_dir
    upload_root.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4().hex
    dest = upload_root / f"{file_id}.jpg"
    try:
        dest.write_bytes(processed)
    except OSError as exc:
        logger.exception("No se pudo guardar la imagen en disco")
        return IngestOutcome(
            status="ai_error",
            message="No se pudo almacenar la imagen procesada.",
            http_status=507,
        )

    estacion = (extracted.estacion_servicio or "").strip()[:160] or None
    ticket = Ticket(
        cuit_proveedor=cuit,
        nro_ticket=nro,
        litros=Decimal(str(extracted.litros)) if extracted.litros is not None else None,
        kilometraje=extracted.kilometraje,
        tipo_combustible=_normalize_tipo_combustible(extracted.tipo_combustible),
        remito=_normalize_remito(extracted.remito),
        fecha=fecha_ticket,
        url_imagen=str(dest.resolve()),
        confidence_score=extracted.confidence_score,
        vehicle_id=resolved_vehicle_id,
        field_device_id=field_device_id,
        operador_nombre=operator_name,
        legajo_conductor=(legajo_conductor or "").strip()[:32] or None,
        nombre_conductor=(nombre_conductor or "").strip()[:160] or None,
        tipo_actividad=(tipo_actividad or "").strip()[:160] or None,
        estacion_servicio=estacion,
        monto=Decimal(str(extracted.monto)) if extracted.monto is not None else None,
        ingested_at=datetime.now(timezone.utc),
    )
    sync_km_o_horas_from_kilometraje(ticket)
    apply_ticket_flags(db, ticket)
    db.add(ticket)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        if _mentions_vehicle_column(exc):
            return IngestOutcome(
                status="validation_error",
                message=VEHICLE_NOT_FOUND,
                http_status=400,
            )
        return IngestOutcome(
            status="duplicate",
            message="Ticket duplicado (violación de unicidad).",
            http_status=409,
        )
    except ProgrammingError as exc:
        db.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        logger.exception("Error de esquema al persistir el ticket")
        if _mentions_vehicle_column(exc):
            return IngestOutcome(
                status="validation_error",
                message=VEHICLE_NOT_FOUND,
                http_status=400,
            )
        return IngestOutcome(
            status="ai_error",
            message="Error al guardar el ticket en la base de datos.",
            http_status=500,
        )
    except Exception:
        db.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        logger.exception("Error al persistir el ticket")
        return IngestOutcome(
            status="ai_error",
            message="Error al guardar el ticket en la base de datos.",
            http_status=500,
        )

    db.refresh(ticket)
    return IngestOutcome(status="created", ticket_dict=_ticket_to_dict(ticket, patente_leida=patente_leida))
