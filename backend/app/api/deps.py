"""Dependencias compartidas de la API (auth admin, etc.)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.security import decode_admin_token
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.services.admin_users import get_admin_by_id, get_admin_by_username


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
    db: Annotated[Session, Depends(get_db)],
    token_query: Annotated[
        str | None,
        Query(
            alias="token",
            include_in_schema=False,
            description="JWT del admin como query (uso interno para <img src>).",
        ),
    ] = None,
) -> AdminUser:
    """Valida JWT (header o ?token=) y devuelve el AdminUser activo."""
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

    admin: AdminUser | None = None
    uid = payload.get("uid")
    if isinstance(uid, int):
        admin = get_admin_by_id(db, uid)
    if admin is None:
        sub = payload.get("sub")
        if isinstance(sub, str):
            admin = get_admin_by_username(db, sub)
    if admin is None or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario admin inactivo o inexistente. Iniciá sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return admin


AdminPrincipal = Annotated[AdminUser, Depends(require_admin)]
