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

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """Sos un extractor de datos para tickets de combustible argentinos.
Analizá la imagen del ticket y devolvé ÚNICAMENTE un objeto JSON válido (sin markdown, sin comentarios)
con estas claves exactas:
- cuit_proveedor: string, CUIT del estacionamiento o razón social (solo dígitos o con guiones, normalizá a 11 dígitos si podés)
- nro_ticket: string, número de comprobante o ticket visible
- litros: número o null si no se lee con confianza
- monto: número en pesos (sin símbolo) o null
- fecha: string ISO 8601 con zona horaria si está en el ticket, o null (ejemplo: 2024-05-10T14:32:00-03:00)
- confidence_score: número entre 0 y 1 indicando confianza global en la extracción

Reglas:
- Si un campo no es legible, usá null (excepto cuit_proveedor y nro_ticket: hacé el mejor esfuerzo con string vacío solo si es ilegible).
- Los números deben ser JSON numbers, no strings.
- No incluyas ninguna clave adicional."""

USER_PROMPT = "Extraé los datos del ticket según el esquema indicado."


class ExtractedTicketData(BaseModel):
    """Validación estricta de la respuesta del modelo."""

    cuit_proveedor: str = Field(..., min_length=1, max_length=32)
    nro_ticket: str = Field(..., min_length=1, max_length=64)
    litros: float | None = None
    monto: float | None = None
    fecha: str | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)

    @field_validator("cuit_proveedor", "nro_ticket", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> str:
        if v is None:
            raise ValueError("valor requerido")
        s = str(v).strip()
        if not s:
            raise ValueError("no puede quedar vacío")
        return s


class AIEngineError(RuntimeError):
    """Error controlado del servicio de IA."""


class AIQuotaExceededError(AIEngineError):
    """Cuota o rate limit de la API de Google (HTTP 429)."""


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


def extract_ticket_from_image(processed_png: bytes) -> ExtractedTicketData:
    """
    Envía la imagen ya pre-procesada a Gemini 1.5 Flash y valida el JSON devuelto.
    """
    settings = get_settings()
    if not settings.google_api_key:
        raise AIEngineError("GOOGLE_API_KEY no está configurada.")

    genai.configure(api_key=settings.google_api_key)

    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=SYSTEM_INSTRUCTION,
    )

    try:
        response = model.generate_content(
            [
                {"mime_type": "image/png", "data": processed_png},
                USER_PROMPT,
            ],
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
    except google_exceptions.GoogleAPIError as exc:
        logger.warning("Error de API de Google: %s", exc)
        raise _google_error_message(exc) from exc
    except Exception as exc:  # noqa: BLE001 - SDK puede lanzar varios tipos
        logger.exception("Error inesperado al llamar a Gemini")
        raise AIEngineError("Error inesperado al procesar la imagen con IA.") from exc

    if not response.candidates:
        raise AIEngineError("Gemini no devolvió candidatos de respuesta (posible bloqueo de contenido).")

    text = (response.text or "").strip()
    if not text:
        raise AIEngineError("Respuesta vacía del modelo.")

    raw = _strip_json_fence(text)
    try:
        payload: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.debug("JSON inválido del modelo: %s", raw[:500])
        raise AIEngineError("El modelo no devolvió JSON válido.") from exc

    try:
        return ExtractedTicketData.model_validate(payload)
    except Exception as exc:
        logger.info("Payload no validó contra esquema: %s", payload)
        raise AIEngineError("Los datos extraídos no cumplen el formato esperado.") from exc
