"""Dependencias compartidas de la API (auth admin, etc.)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request, status

from app.core.security import decode_admin_token


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_admin(
    request: Request,
    token_query: Annotated[
        str | None,
        Query(
            alias="token",
            include_in_schema=False,
            description="JWT del admin como query (uso interno para <img src>).",
        ),
    ] = None,
) -> dict:
    """Valida JWT del header Authorization o, como fallback, ?token=... (img URLs)."""
    raw = _extract_bearer(request) or token_query
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_admin_token(raw)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc) or "Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rol insuficiente.",
        )
    return payload


AdminPrincipal = Annotated[dict, Depends(require_admin)]
