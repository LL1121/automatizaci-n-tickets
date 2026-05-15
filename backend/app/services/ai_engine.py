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

SYSTEM_INSTRUCTION = """Sos un extractor de datos para tickets de combustible YPF EN RUTA (Argentina).
Analizá la imagen del ticket térmico (suele ser alto y angosto) y devolvé ÚNICAMENTE un objeto JSON válido
(sin markdown, sin comentarios) con estas claves exactas:

- cuit_proveedor: string, CUIT del proveedor/estación (11 dígitos si podés, con o sin guiones)
- nro_ticket: string, número de comprobante o transacción visible en el ticket
- patente: string, valor junto a la etiqueta "Patente:" (ej. AG975ZC, AC979ML). Solo la patente, sin "Patente:"
- kilometraje: entero, odómetro al lado de "Km:" o "Km." (solo dígitos, sin separadores de miles)
- litros: número decimal, cantidad bajo la columna "CANT" del producto (ej. INFINIA DIESEL). Es litros cargados.
- fecha: string ISO 8601 con zona -03:00. Preferí "Fecha Impresion" del pie; si no, la fecha/hora del encabezado.
- confidence_score: número entre 0 y 1 (confianza global)

Reglas YPF EN RUTA:
- cuit_proveedor, nro_ticket y patente son OBLIGATORIOS: nunca string vacío.
- kilometraje y litros: si no se leen con confianza, usá null (no inventes).
- fecha: obligatoria si está legible en el ticket; formato ISO (ej. 2026-05-14T12:05:21-03:00).
- Los tickets NO traen monto en pesos: no incluyas monto ni campos de importe.
- patente: mayúsculas, sin espacios internos salvo que en el ticket vengan (normalizá quitando espacios).
- kilometraje debe ser JSON integer, litros JSON number.
- No incluyas ninguna clave adicional."""

USER_PROMPT = (
    "Extraé los datos del ticket YPF EN RUTA según el esquema. "
    "Buscá Patente:, Km:, columna CANT y Fecha Impresion."
)


class ExtractedTicketData(BaseModel):
    """Validación estricta de la respuesta del modelo."""

    cuit_proveedor: str = Field(..., min_length=1, max_length=32)
    nro_ticket: str = Field(..., min_length=1, max_length=64)
    patente: str = Field(..., min_length=1, max_length=32)
    kilometraje: int | None = None
    litros: float | None = None
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


def extract_ticket_from_image(processed_png: bytes) -> ExtractedTicketData:
    """
    Envía la imagen ya pre-procesada a Gemini y valida el JSON devuelto.
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

    cuit = str(payload.get("cuit_proveedor") or "").strip()
    nro = str(payload.get("nro_ticket") or "").strip()
    patente = str(payload.get("patente") or "").strip()
    if not cuit or not nro or not patente:
        logger.info("Extracción incompleta (CUIT, ticket o patente vacío): %s", payload)
        raise AIExtractionIncompleteError(
            "No se pudo leer el CUIT, el número de ticket o la patente en la foto. "
            "Encuadrá todo el ticket (es alto), usá buena luz y volvé a capturar."
        )

    try:
        return ExtractedTicketData.model_validate(payload)
    except Exception as exc:
        logger.info("Payload no validó contra esquema: %s", payload)
        raise AIEngineError("Los datos extraídos no cumplen el formato esperado.") from exc
