"""Segmentación de hojas A4 con múltiples tickets pegados.

Estrategia (heurística, robusta para escaneos típicos de oficina):
1. Pasar a escala de grises + suavizado.
2. Threshold de Otsu inverso (los tickets, llenos de texto, quedan blancos sobre fondo negro).
3. Cierre morfológico vertical: une el texto vertical de un ticket en una mancha.
4. `findContours` y filtrado por área mínima y forma compatible con un ticket térmico
   (más alto que ancho, aspecto entre 1.4 y 12).
5. Fusión de cajas que se superponen.
6. Si encontró ≥ 2 cajas válidas → recorta cada una con padding; sino → imagen completa.
"""

from __future__ import annotations

import logging
from typing import Final

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MIN_AREA_RATIO: Final[float] = 0.02
_TICKET_ASPECT_MIN: Final[float] = 1.3
_TICKET_ASPECT_MAX: Final[float] = 14.0
_PAD_PX: Final[int] = 14


def _bgr_to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    if image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def _merge_overlapping(rects: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Une cajas (x1,y1,x2,y2) que se solapan o están muy próximas."""
    if not rects:
        return []
    merged: list[list[int]] = [list(rects[0])]
    for rect in rects[1:]:
        x1, y1, x2, y2 = rect
        absorbed = False
        for m in merged:
            mx1, my1, mx2, my2 = m
            if x1 <= mx2 + 6 and mx1 <= x2 + 6 and y1 <= my2 + 6 and my1 <= y2 + 6:
                m[0] = min(mx1, x1)
                m[1] = min(my1, y1)
                m[2] = max(mx2, x2)
                m[3] = max(my2, y2)
                absorbed = True
                break
        if not absorbed:
            merged.append([x1, y1, x2, y2])
    return [tuple(m) for m in merged]  # type: ignore[return-value]


def _detect_ticket_rects(image: np.ndarray) -> list[tuple[int, int, int, int]]:
    h, w = image.shape[:2]
    img_area = float(h * w)
    if img_area <= 0:
        return []

    gray = _bgr_to_gray(image)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Cierre vertical: une líneas de texto de cada ticket en una columna.
    kv = cv2.getStructuringElement(cv2.MORPH_RECT, (5, max(11, h // 70)))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kv)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects: list[tuple[int, int, int, int]] = []
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw <= 0 or ch <= 0:
            continue
        area = cw * ch
        if area / img_area < _MIN_AREA_RATIO:
            continue
        aspect = ch / max(cw, 1)
        if aspect < _TICKET_ASPECT_MIN or aspect > _TICKET_ASPECT_MAX:
            continue
        rects.append((x, y, x + cw, y + ch))

    rects = _merge_overlapping(rects)
    rects.sort(key=lambda r: (r[1], r[0]))
    return rects


def segment_tickets(image: np.ndarray) -> list[np.ndarray]:
    """Si detecta varios tickets en una hoja, devuelve recortes; sino, [image]."""
    if image is None or image.size == 0:
        return []
    h, w = image.shape[:2]
    rects = _detect_ticket_rects(image)

    if len(rects) < 2:
        return [image]

    crops: list[np.ndarray] = []
    for (x1, y1, x2, y2) in rects:
        x1p = max(0, x1 - _PAD_PX)
        y1p = max(0, y1 - _PAD_PX)
        x2p = min(w, x2 + _PAD_PX)
        y2p = min(h, y2 + _PAD_PX)
        crop = image[y1p:y2p, x1p:x2p]
        if crop.size == 0:
            continue
        crops.append(crop)
    logger.info("Segmentación A4: %d tickets detectados (imagen %dx%d).", len(crops), w, h)
    return crops if crops else [image]


def decode_image_bytes(raw: bytes) -> np.ndarray | None:
    if not raw:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def encode_image_jpeg(image: np.ndarray, quality: int = 90) -> bytes:
    ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise RuntimeError("OpenCV no pudo codificar el recorte a JPEG.")
    return encoded.tobytes()
