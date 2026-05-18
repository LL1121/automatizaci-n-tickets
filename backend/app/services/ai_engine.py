"""Motor de extracción estructurada con Gemini (visión + JSON estricto)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.services.plate import normalize_patente

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """Sos un extractor de datos para tickets de combustible YPF EN RUTA (Argentina).
Analizá UNA imagen del ticket térmico (alto y angosto) y devolvé ÚNICAMENTE un objeto JSON válido
(sin markdown) con estas claves exactas:

- cuit_proveedor: string, CUIT del proveedor/estación (11 dígitos si podés)
- nro_ticket: string, número de comprobante o transacción
- patente: string, valor junto a "Patente:" (solo la patente, sin la etiqueta)
- kilometraje: entero, odómetro junto a "Km:" o "Km." (solo dígitos)
- litros: número decimal, valor bajo la columna "CANT"
- remito: string o null, junto a "REMITO" si aparece
- fecha: string ISO 8601 con zona -03:00 (preferí "Fecha Impresion" del pie)
- confidence_score: número entre 0 y 1

OCR en tickets térmicos — leé carácter por carácter; evitá confusiones:
- C vs G, O vs 0, I/L vs 1, S vs 5, B vs 8, Z vs 2, M vs N
- Patentes Mercosur: 2 letras + 3 dígitos + 2 letras (ej. AC979ML)
- Si hay varios tickets en la hoja, extraé SOLO el que está centrado/encuadrado en la foto

Reglas:
- cuit_proveedor, nro_ticket y patente son OBLIGATORIOS
- No incluyas monto en pesos ni claves extra
- kilometraje: integer o null; litros: number o null; remito: null si no hay REMITO legible"""

USER_PROMPT = (
    "Extraé los datos del ticket YPF EN RUTA. "
    "Buscá Patente:, Km:, columna CANT (litros), REMITO (si existe) y Fecha Impresion."
)


class ExtractedTicketData(BaseModel):
    """Validación estricta de la respuesta del modelo."""

    cuit_proveedor: str = Field(..., min_length=1, max_length=32)
    nro_ticket: str = Field(..., min_length=1, max_length=64)
    patente: str = Field(..., min_length=1, max_length=32)
    kilometraje: int | None = None
    litros: float | None = None
    remito: str | None = None
    fecha: str | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)

    @field_validator("cuit_proveedor", "nro_ticket", "patente", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> str:
        if v is None:
            raise ValueError("valor requerido")
        s = str(v).strip()
        if not s:
            raise ValueError("no puede quedar vacío")
        return s

    @field_validator("kilometraje", mode="before")
    @classmethod
    def parse_kilometraje(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, float):
            return int(v)
        if isinstance(v, int):
            return v
        digits = re.sub(r"\D", "", str(v))
        if not digits:
            return None
        return int(digits)

    @field_validator("remito", mode="before")
    @classmethod
    def parse_remito(cls, v: Any) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip()
        return s if s else None


class AIEngineError(RuntimeError):
    """Error controlado del servicio de IA."""


class AIQuotaExceededError(AIEngineError):
    """Cuota o rate limit de la API de Google (HTTP 429)."""


class AIExtractionIncompleteError(AIEngineError):
    """La imagen no permitió leer campos obligatorios del ticket."""


def _google_error_message(exc: google_exceptions.GoogleAPIError) -> AIEngineError:
    if isinstance(exc, google_exceptions.ResourceExhausted):
        return AIQuotaExceededError(
            "Cuota de Gemini agotada (plan gratuito o límite diario). "
            "Probá más tarde, cambiá GEMINI_MODEL en .env (ej. gemini-2.0-flash-lite) "
            "o activá facturación en Google AI Studio: https://aistudio.google.com/apikey"
        )
    if isinstance(exc, google_exceptions.NotFound):
        return AIEngineError(
            f"Modelo Gemini no disponible ({get_settings().gemini_model}). "
            "Revisá GEMINI_MODEL en .env."
        )
    if isinstance(exc, google_exceptions.PermissionDenied):
        return AIEngineError(
            "API key de Google inválida o sin permiso para este modelo. Revisá GOOGLE_API_KEY."
        )
    return AIEngineError("Fallo la comunicación con el servicio de Gemini.")


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


_TICKET_FIELD_KEYS = frozenset({"cuit_proveedor", "nro_ticket", "patente"})


def _looks_like_ticket_payload(data: dict[str, Any]) -> bool:
    return bool(_TICKET_FIELD_KEYS & data.keys())


def _coerce_ticket_payload(data: Any) -> dict[str, Any]:
    """
    Gemini a veces devuelve [{...}] o {"tickets": [{...}]} en lugar de un objeto plano.
    """
    if isinstance(data, list):
        for item in data:
            try:
                return _coerce_ticket_payload(item)
            except AIEngineError:
                continue
        raise AIEngineError("El modelo devolvió una lista sin datos de ticket válidos.")

    if isinstance(data, dict):
        if _looks_like_ticket_payload(data):
            return data
        for key in ("ticket", "tickets", "result", "data", "comprobante", "items"):
            inner = data.get(key)
            if inner is not None:
                return _coerce_ticket_payload(inner)
        return data

    raise AIEngineError("El modelo no devolvió un objeto JSON con los campos del ticket.")


def _build_vision_parts(processed_png: bytes, *, expected_patente: str | None) -> list[Any]:
    parts: list[Any] = [
        {"mime_type": "image/png", "data": processed_png},
    ]
    if expected_patente:
        parts.append(
            f"El operador seleccionó el vehículo {expected_patente}. "
            "La patente junto a «Patente:» debe coincidir (revisá C/G, 9/5, M/Z, O/0)."
        )
    parts.append(USER_PROMPT)
    return parts


def extract_ticket_from_image(
    processed_png: bytes,
    *,
    expected_patente: str | None = None,
) -> ExtractedTicketData:
    """Envía una imagen pre-procesada a Gemini y valida el JSON devuelto."""
    settings = get_settings()
    if not settings.google_api_key:
        raise AIEngineError("GOOGLE_API_KEY no está configurada.")

    hint = normalize_patente(expected_patente) if expected_patente else None
    content_parts = _build_vision_parts(processed_png, expected_patente=hint)

    genai.configure(api_key=settings.google_api_key)

    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=SYSTEM_INSTRUCTION,
    )

    try:
        response = model.generate_content(
            content_parts,
            generation_config=genai.GenerationConfig(
                temperature=0.05,
                response_mime_type="application/json",
            ),
        )
    except google_exceptions.GoogleAPIError as exc:
        logger.warning("Error de API de Google: %s", exc)
        raise _google_error_message(exc) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error inesperado al llamar a Gemini")
        raise AIEngineError("Error inesperado al procesar la imagen con IA.") from exc

    if not response.candidates:
        raise AIEngineError("Gemini no devolvió candidatos de respuesta (posible bloqueo de contenido).")

    text = (response.text or "").strip()
    if not text:
        raise AIEngineError("Respuesta vacía del modelo.")

    raw = _strip_json_fence(text)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.debug("JSON inválido del modelo: %s", raw[:500])
        raise AIEngineError("El modelo no devolvió JSON válido.") from exc

    try:
        payload = _coerce_ticket_payload(parsed)
    except AIEngineError:
        logger.info("JSON del modelo con forma inesperada: %s", type(parsed).__name__)
        raise

    cuit = str(payload.get("cuit_proveedor") or "").strip()
    nro = str(payload.get("nro_ticket") or "").strip()
    patente = str(payload.get("patente") or "").strip()
    if not cuit or not nro or not patente:
        logger.info("Extracción incompleta (CUIT, ticket o patente vacío): %s", payload)
        raise AIExtractionIncompleteError(
            "No se pudo leer el CUIT, el número de ticket o la patente en la foto. "
            "Encuadrá un solo ticket con buena luz y volvé a capturar."
        )

    try:
        return ExtractedTicketData.model_validate(payload)
    except Exception as exc:
        logger.info("Payload no validó contra esquema: %s", payload)
        raise AIEngineError("Los datos extraídos no cumplen el formato esperado.") from exc
