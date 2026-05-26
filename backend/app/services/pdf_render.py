"""Conversión de PDFs a imágenes (numpy BGR) usando pypdfium2.

Independiente del sistema operativo, sin Poppler ni Ghostscript.
"""

from __future__ import annotations

import logging
from typing import Final

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_DPI: Final[int] = 200
_MAX_PAGES: Final[int] = 30


class PdfRenderError(RuntimeError):
    """Error al renderizar un PDF."""


def render_pdf_to_bgr(pdf_bytes: bytes, *, dpi: int = _DEFAULT_DPI) -> list[np.ndarray]:
    if not pdf_bytes:
        raise PdfRenderError("PDF vacío.")
    try:
        import pypdfium2 as pdfium  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise PdfRenderError("pypdfium2 no está instalado en el contenedor.") from exc

    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:  # noqa: BLE001
        raise PdfRenderError("No se pudo abrir el PDF (archivo corrupto o protegido).") from exc

    scale = dpi / 72.0
    images: list[np.ndarray] = []
    try:
        for idx, page in enumerate(pdf):
            if idx >= _MAX_PAGES:
                logger.warning("PDF truncado en %d páginas (límite por seguridad).", _MAX_PAGES)
                break
            try:
                pil_image = page.render(scale=scale).to_pil()
            except Exception:  # noqa: BLE001
                logger.exception("Fallo render de página %d", idx)
                continue
            arr = np.array(pil_image)
            if arr.ndim == 3 and arr.shape[2] == 4:
                arr = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
            elif arr.ndim == 3 and arr.shape[2] == 3:
                arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            images.append(arr)
    finally:
        try:
            pdf.close()
        except Exception:  # noqa: BLE001
            pass

    if not images:
        raise PdfRenderError("El PDF no contenía páginas legibles.")
    return images
