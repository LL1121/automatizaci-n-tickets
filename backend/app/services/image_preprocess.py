"""Pre-procesamiento de imágenes con OpenCV antes de enviarlas al modelo."""

from __future__ import annotations

import logging
from typing import Final

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MAX_EDGE_PX: Final[int] = 1600


class ImagePreprocessError(ValueError):
    """Error al decodificar o normalizar la imagen de entrada."""


def preprocess_for_vision(raw_bytes: bytes) -> bytes:
    """
    Convierte la imagen a escala de grises y redimensiona conservando aspecto
    si algún lado supera MAX_EDGE_PX. Devuelve PNG en bytes.
    """
    if not raw_bytes:
        raise ImagePreprocessError("El archivo de imagen está vacío.")

    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ImagePreprocessError("No se pudo decodificar la imagen (formato no soportado o corrupto).")

    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        max_dim = max(h, w)
        if max_dim > _MAX_EDGE_PX:
            scale = _MAX_EDGE_PX / float(max_dim)
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)

        ok, encoded = cv2.imencode(".png", gray)
        if not ok:
            raise ImagePreprocessError("OpenCV no pudo codificar la imagen a PNG.")
        return encoded.tobytes()
    except cv2.error as exc:  # pragma: no cover - depende de builds de OpenCV
        logger.exception("Fallo OpenCV durante el pre-procesamiento")
        raise ImagePreprocessError("Error interno al procesar la imagen.") from exc
