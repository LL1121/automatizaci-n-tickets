"""Normalización y comparación de patentes argentinas."""

from __future__ import annotations

import re


def normalize_patente(raw: str) -> str:
    """Solo letras y dígitos en mayúsculas (sin espacios ni guiones)."""
    return re.sub(r"[^A-Z0-9]", "", raw.upper().strip())


def patentes_coinciden(a: str, b: str) -> bool:
    na, nb = normalize_patente(a), normalize_patente(b)
    if not na or not nb:
        return False
    return na == nb
