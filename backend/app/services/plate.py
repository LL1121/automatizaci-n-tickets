"""Normalización y comparación de patentes argentinas."""

from __future__ import annotations

import re


def normalize_patente(raw: str) -> str:
    """Solo letras y dígitos en mayúsculas (sin espacios ni guiones)."""
    return re.sub(r"[^A-Z0-9]", "", raw.upper().strip())


def format_patente_display(raw: str | None) -> str:
    """Mercosur AA000AA → AA-000-AA. Solo para mostrar; la base queda sin guiones."""
    if not raw:
        return ""
    n = normalize_patente(raw)
    if re.fullmatch(r"[A-Z]{2}\d{3}[A-Z]{2}", n):
        return f"{n[:2]}-{n[2:5]}-{n[5:]}"
    if re.fullmatch(r"[A-Z]{3}\d{3}", n):
        return f"{n[:3]} {n[3:]}"
    return n


def patentes_coinciden(a: str, b: str) -> bool:
    na, nb = normalize_patente(a), normalize_patente(b)
    if not na or not nb:
        return False
    return na == nb
