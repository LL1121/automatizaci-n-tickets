"""CRUD y reglas de negocio de usuarios administradores."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models.admin_user import AdminUser

logger = logging.getLogger(__name__)

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,64}$")
MIN_PASSWORD_LEN = 8


class AdminUserError(ValueError):
    """Validación de negocio sobre usuarios admin."""


def normalize_username(raw: str) -> str:
    return (raw or "").strip().lower()


def _validate_username(username: str) -> str:
    u = normalize_username(username)
    if not USERNAME_RE.match(u):
        raise AdminUserError(
            "Usuario inválido. Usá entre 3 y 64 caracteres alfanuméricos (también . _ -).",
        )
    return u


def _validate_password(password: str) -> str:
    if not password or len(password) < MIN_PASSWORD_LEN:
        raise AdminUserError(f"La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres.")
    if len(password) > 256:
        raise AdminUserError("La contraseña es demasiado larga (máx 256).")
    return password


def count_active_admins(db: Session) -> int:
    n = db.scalar(select(func.count(AdminUser.id)).where(AdminUser.is_active.is_(True)))
    return int(n or 0)


def list_admins(db: Session) -> list[AdminUser]:
    return list(db.scalars(select(AdminUser).order_by(AdminUser.username.asc())).all())


def get_admin_by_id(db: Session, admin_id: int) -> AdminUser | None:
    return db.get(AdminUser, admin_id)


def get_admin_by_username(db: Session, username: str) -> AdminUser | None:
    u = normalize_username(username)
    if not u:
        return None
    return db.scalar(select(AdminUser).where(AdminUser.username == u))


def create_admin(
    db: Session,
    *,
    username: str,
    password: str,
    full_name: str | None = None,
    is_active: bool = True,
) -> AdminUser:
    u = _validate_username(username)
    pwd = _validate_password(password)
    name = (full_name or "").strip() or None
    admin = AdminUser(
        username=u,
        password_hash=hash_password(pwd),
        full_name=name,
        is_active=bool(is_active),
    )
    db.add(admin)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AdminUserError(f"Ya existe un usuario llamado «{u}».") from exc
    db.refresh(admin)
    logger.info("Admin creado: %s (id=%s)", admin.username, admin.id)
    return admin


def set_password(db: Session, admin: AdminUser, new_password: str) -> AdminUser:
    pwd = _validate_password(new_password)
    admin.password_hash = hash_password(pwd)
    db.commit()
    db.refresh(admin)
    logger.info("Password actualizada para admin %s", admin.username)
    return admin


def set_active(db: Session, admin: AdminUser, active: bool) -> AdminUser:
    if not active and admin.is_active and count_active_admins(db) <= 1:
        raise AdminUserError("No podés desactivar al único administrador activo.")
    admin.is_active = bool(active)
    db.commit()
    db.refresh(admin)
    return admin


def update_full_name(db: Session, admin: AdminUser, full_name: str | None) -> AdminUser:
    name = (full_name or "").strip() or None
    admin.full_name = name
    db.commit()
    db.refresh(admin)
    return admin


def authenticate(db: Session, username: str, password: str) -> AdminUser | None:
    u = normalize_username(username)
    if not u or not password:
        return None
    admin = get_admin_by_username(db, u)
    if admin is None or not admin.is_active:
        return None
    if not verify_password(password, admin.password_hash):
        return None
    admin.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(admin)
    return admin


def bootstrap_admin_from_env(db: Session) -> AdminUser | None:
    """
    Crea el primer admin desde ADMIN_USERNAME / ADMIN_PASSWORD si no hay ninguno en la base.

    Sirve para no quedar afuera del panel después de migrar desde la versión vieja
    (auth solo por env). Si ya hay algún admin en DB, no hace nada.
    """
    settings = get_settings()
    total = int(db.scalar(select(func.count(AdminUser.id))) or 0)
    if total > 0:
        return None
    username = (settings.admin_username or "").strip()
    password = settings.admin_password or ""
    if not username or not password:
        logger.warning(
            "No hay admins en la base y ADMIN_USERNAME/ADMIN_PASSWORD no están definidos: "
            "ningún usuario podrá entrar al panel. Creá uno con: docker compose exec api "
            "python -m app.cli.manage_admin create <usuario>",
        )
        return None
    try:
        admin = create_admin(
            db,
            username=username,
            password=password,
            full_name="Administrador",
            is_active=True,
        )
        logger.info("Admin inicial creado desde ADMIN_USERNAME/ADMIN_PASSWORD (%s).", admin.username)
        return admin
    except AdminUserError as exc:
        logger.warning("No se pudo crear admin inicial: %s", exc)
        return None
