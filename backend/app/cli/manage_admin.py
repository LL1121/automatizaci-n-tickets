"""
Gestión de usuarios administradores del panel.

Ejemplos (dentro del contenedor api o con backend activo):

  python -m app.cli.manage_admin list
  python -m app.cli.manage_admin create lautaro
  python -m app.cli.manage_admin create lautaro --password "MiClave123"
  python -m app.cli.manage_admin reset lautaro
  python -m app.cli.manage_admin reset lautaro --password "NuevaClave123"
  python -m app.cli.manage_admin deactivate ana
  python -m app.cli.manage_admin activate ana

Con Docker desde la raíz del repo:
  docker compose exec api python -m app.cli.manage_admin list
  ./scripts/manage-admin.sh create lautaro
"""

from __future__ import annotations

import argparse
import getpass
import logging
import secrets
import string
import sys
from typing import Iterable

from app.db.session import get_session_factory, verify_database_connection
from app.services.admin_users import (
    AdminUserError,
    create_admin,
    get_admin_by_username,
    list_admins,
    set_active,
    set_password,
    update_full_name,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("manage_admin")


def _print_table(rows: Iterable) -> None:
    rows = list(rows)
    if not rows:
        print("Sin usuarios administradores en la base.")
        return
    headers = ("id", "username", "activo", "creado", "último login", "nombre")
    print("  ".join(headers))
    for a in rows:
        print(
            "  ".join(
                [
                    f"{a.id:>3}",
                    a.username.ljust(20),
                    "sí" if a.is_active else "no",
                    a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
                    a.last_login_at.strftime("%Y-%m-%d %H:%M") if a.last_login_at else "—",
                    (a.full_name or ""),
                ],
            ),
        )


def _prompt_password(generate: bool) -> str:
    if generate:
        alphabet = string.ascii_letters + string.digits
        pwd = "".join(secrets.choice(alphabet) for _ in range(14))
        print(f"\nContraseña generada: {pwd}")
        print("Guardala antes de cerrar la terminal, no se va a volver a mostrar.")
        return pwd
    while True:
        a = getpass.getpass("Contraseña nueva: ")
        b = getpass.getpass("Confirmar contraseña: ")
        if a != b:
            print("No coinciden, probá de nuevo.\n", file=sys.stderr)
            continue
        return a


def cmd_list(args: argparse.Namespace) -> int:  # noqa: ARG001
    with get_session_factory()() as db:
        _print_table(list_admins(db))
    return 0


def cmd_create(args: argparse.Namespace) -> int:
    password = args.password or _prompt_password(args.generate_password)
    with get_session_factory()() as db:
        try:
            admin = create_admin(
                db,
                username=args.username,
                password=password,
                full_name=args.full_name,
            )
        except AdminUserError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
    print(f"\nUsuario «{admin.username}» creado (id={admin.id}).")
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    password = args.password or _prompt_password(args.generate_password)
    with get_session_factory()() as db:
        admin = get_admin_by_username(db, args.username)
        if admin is None:
            print(f"Error: no existe el usuario «{args.username}».", file=sys.stderr)
            return 1
        try:
            set_password(db, admin, password)
        except AdminUserError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
    print(f"\nContraseña actualizada para «{args.username}».")
    return 0


def cmd_rename(args: argparse.Namespace) -> int:
    with get_session_factory()() as db:
        admin = get_admin_by_username(db, args.username)
        if admin is None:
            print(f"Error: no existe el usuario «{args.username}».", file=sys.stderr)
            return 1
        update_full_name(db, admin, args.full_name)
    print(f"Nombre completo actualizado para «{args.username}».")
    return 0


def _set_active(args: argparse.Namespace, *, active: bool) -> int:
    with get_session_factory()() as db:
        admin = get_admin_by_username(db, args.username)
        if admin is None:
            print(f"Error: no existe el usuario «{args.username}».", file=sys.stderr)
            return 1
        try:
            set_active(db, admin, active)
        except AdminUserError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
    print(f"Usuario «{args.username}» {'activado' if active else 'desactivado'}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="manage_admin", description="Gestión de usuarios admin.")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="Listar usuarios admin").set_defaults(func=cmd_list)

    pc = sub.add_parser("create", help="Crear un nuevo usuario admin")
    pc.add_argument("username")
    pc.add_argument("--full-name", default=None, help="Nombre y apellido visible")
    g = pc.add_mutually_exclusive_group()
    g.add_argument("--password", default=None, help="Contraseña explícita (evitalo en historial de shell)")
    g.add_argument("--generate-password", action="store_true", help="Generar contraseña aleatoria")
    pc.set_defaults(func=cmd_create)

    pr = sub.add_parser("reset", help="Resetear la contraseña de un usuario")
    pr.add_argument("username")
    g2 = pr.add_mutually_exclusive_group()
    g2.add_argument("--password", default=None)
    g2.add_argument("--generate-password", action="store_true")
    pr.set_defaults(func=cmd_reset)

    pn = sub.add_parser("rename", help="Cambiar el nombre completo del usuario")
    pn.add_argument("username")
    pn.add_argument("full_name")
    pn.set_defaults(func=cmd_rename)

    pd = sub.add_parser("deactivate", help="Desactivar un usuario admin")
    pd.add_argument("username")
    pd.set_defaults(func=lambda a: _set_active(a, active=False))

    pa = sub.add_parser("activate", help="Reactivar un usuario admin")
    pa.add_argument("username")
    pa.set_defaults(func=lambda a: _set_active(a, active=True))

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    verify_database_connection()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
