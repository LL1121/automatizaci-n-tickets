"""Construcción segura de DATABASE_URL (contraseñas con @, #, etc.)."""

from __future__ import annotations

from urllib.parse import quote_plus


def build_database_url(
    *,
    user: str,
    password: str,
    host: str,
    port: int,
    database: str,
) -> str:
    u = quote_plus(user, safe="")
    p = quote_plus(password, safe="")
    return f"postgresql://{u}:{p}@{host}:{port}/{database}"
