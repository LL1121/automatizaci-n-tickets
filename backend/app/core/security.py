"""Auth utilitaria para el panel admin: JWT HS256 con un único usuario por env."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_AUDIENCE = "fuelops-admin"

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _password_hash() -> str | None:
    """Hash bcrypt del admin (cacheado por settings.admin_password)."""
    pwd = get_settings().admin_password
    if not pwd:
        return None
    if not hasattr(_password_hash, "_cache"):
        _password_hash._cache = {}  # type: ignore[attr-defined]
    cache = _password_hash._cache  # type: ignore[attr-defined]
    if pwd not in cache:
        cache.clear()
        cache[pwd] = _pwd_ctx.hash(pwd)
    return cache[pwd]


def verify_admin_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    expected_user = settings.admin_username
    expected_hash = _password_hash()
    if not expected_user or expected_hash is None:
        logger.warning("Login admin deshabilitado: ADMIN_PASSWORD vacío.")
        return False
    user_ok = secrets.compare_digest(username.strip(), expected_user.strip())
    pass_ok = _pwd_ctx.verify(password, expected_hash) if user_ok else False
    return user_ok and pass_ok


def _jwt_secret() -> str:
    secret = get_settings().jwt_secret.strip()
    if not secret:
        raise RuntimeError(
            "JWT_SECRET no está configurado. Definí JWT_SECRET en el entorno para habilitar el panel admin.",
        )
    return secret


def create_admin_token(subject: str, expires_minutes: int | None = None) -> tuple[str, datetime]:
    settings = get_settings()
    minutes = expires_minutes if expires_minutes is not None else settings.jwt_expires_minutes
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=minutes)
    payload = {
        "sub": subject,
        "role": "admin",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "aud": JWT_AUDIENCE,
    }
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
