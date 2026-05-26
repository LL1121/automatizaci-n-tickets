"""Auth utilitaria para el panel admin: hash bcrypt + JWT HS256.

La verificación de credenciales contra la base vive en `app.services.admin_users`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_AUDIENCE = "fuelops-admin"

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    if not plain:
        raise ValueError("La contraseña no puede quedar vacía.")
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return _pwd_ctx.verify(plain, hashed)
    except Exception:  # noqa: BLE001
        return False


def _jwt_secret() -> str:
    secret = get_settings().jwt_secret.strip()
    if not secret:
        raise RuntimeError(
            "JWT_SECRET no está configurado. Definí JWT_SECRET en el entorno para habilitar el panel admin.",
        )
    return secret


def create_admin_token(
    subject: str,
    *,
    admin_id: int | None = None,
    expires_minutes: int | None = None,
) -> tuple[str, datetime]:
    settings = get_settings()
    minutes = expires_minutes if expires_minutes is not None else settings.jwt_expires_minutes
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": "admin",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "aud": JWT_AUDIENCE,
    }
    if admin_id is not None:
        payload["uid"] = admin_id
    token = jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)
    return token, exp


def decode_admin_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            _jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            audience=JWT_AUDIENCE,
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise PermissionError("token expirado") from exc
    except jwt.InvalidTokenError as exc:
        raise PermissionError("token inválido") from exc
