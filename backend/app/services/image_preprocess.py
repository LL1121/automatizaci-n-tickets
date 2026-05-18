"""Pre-procesamiento de imágenes con OpenCV antes de enviarlas al modelo."""

from __future__ import annotations

import logging
from typing import Final

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MAX_EDGE_PX: Final[int] = 2048


class ImagePreprocessError(ValueError):
    """Error al decodificar o normalizar la imagen de entrada."""


def _enhance_gray(gray: np.ndarray) -> np.ndarray:
    """Mejora contraste y nitidez típica de tickets térmicos."""
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.bilateralFilter(enhanced, 5, 55, 55)
    blur = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.1)
    return cv2.addWeighted(enhanced, 1.55, blur, -0.55, 0)


def preprocess_for_vision(raw_bytes: bytes) -> bytes:
    """
    Una sola imagen optimizada para IA: escala de grises, contraste/nitidez y resize.
    """
    if not raw_bytes:
        raise ImagePreprocessError("El archivo de imagen está vacío.")

    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ImagePreprocessError("No se pudo decodificar la imagen (formato no soportado o corrupto).")

    try:
        gray = _enhance_gray(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
        h, w = gray.shape[:2]
        max_dim = max(h, w)
        if max_dim > _MAX_EDGE_PX:
            scale = _MAX_EDGE_PX / float(max_dim)
            gray = cv2.resize(
                gray,
                (max(1, int(w * scale)), max(1, int(h * scale))),
                interpolation=cv2.INTER_AREA,
            )

        ok, encoded = cv2.imencode(".png", gray)
        if not ok:
            raise ImagePreprocessError("OpenCV no pudo codificar la imagen a PNG.")
        return encoded.tobytes()
    except cv2.error as exc:  # pragma: no cover
        logger.exception("Fallo OpenCV durante el pre-procesamiento")
        raise ImagePreprocessError("Error interno al procesar la imagen.") from exc
