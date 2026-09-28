"""Ajustes incrementales de esquema (create_all no altera tablas existentes)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _add_column_if_missing(conn, table: str, col_names: set[str], name: str, ddl: str) -> None:
    if name in col_names:
        return
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
    logger.info("Migración: columna %s.%s agregada", table, name)
    col_names.add(name)


def apply_schema_migrations(engine: Engine) -> None:
    insp = inspect(engine)
    table_names = set(insp.get_table_names())

    with engine.begin() as conn:
        if "tickets" in table_names:
            col_names = {c["name"] for c in insp.get_columns("tickets")}

            _add_column_if_missing(conn, "tickets", col_names, "kilometraje", "kilometraje INTEGER")

            # Circular 08: monto vuelve a ser necesario para la planilla oficial.
            # Migraciones viejas lo borraban; ahora lo re-creamos si falta.
            _add_column_if_missing(conn, "tickets", col_names, "monto", "monto NUMERIC(14, 2)")

            _add_column_if_missing(
                conn,
                "tickets",
                col_names,
                "tipo_combustible",
                "tipo_combustible VARCHAR(64) NOT NULL DEFAULT 'INFINIA DIESEL'",
            )
            _add_column_if_missing(conn, "tickets", col_names, "remito", "remito VARCHAR(64)")
            _add_column_if_missing(conn, "tickets", col_names, "operador_nombre", "operador_nombre VARCHAR(120)")
            _add_column_if_missing(conn, "tickets", col_names, "field_device_id", "field_device_id INTEGER")

            _add_column_if_missing(conn, "tickets", col_names, "legajo_conductor", "legajo_conductor VARCHAR(32)")
            _add_column_if_missing(conn, "tickets", col_names, "nombre_conductor", "nombre_conductor VARCHAR(160)")
            _add_column_if_missing(conn, "tickets", col_names, "tipo_actividad", "tipo_actividad VARCHAR(64)")
            _add_column_if_missing(conn, "tickets", col_names, "estacion_servicio", "estacion_servicio VARCHAR(160)")
            _add_column_if_missing(conn, "tickets", col_names, "km_o_horas", "km_o_horas NUMERIC(14, 3)")
            _add_column_if_missing(
                conn,
                "tickets",
                col_names,
                "rendicion_tardia",
                "rendicion_tardia BOOLEAN NOT NULL DEFAULT FALSE",
            )
            _add_column_if_missing(
                conn,
                "tickets",
                col_names,
                "desvio_detectado",
                "desvio_detectado BOOLEAN NOT NULL DEFAULT FALSE",
            )
            _add_column_if_missing(conn, "tickets", col_names, "desvio_pct", "desvio_pct FLOAT")

        if "vehicles" in table_names:
            vcols = {c["name"] for c in insp.get_columns("vehicles")}
            _add_column_if_missing(conn, "vehicles", vcols, "tipo", "tipo VARCHAR(32)")
            _add_column_if_missing(conn, "vehicles", vcols, "consumo_esperado", "consumo_esperado FLOAT")
            _add_column_if_missing(
                conn,
                "vehicles",
                vcols,
                "unidad_consumo",
                "unidad_consumo VARCHAR(16) DEFAULT 'l_100km'",
            )
            _add_column_if_missing(
                conn,
                "vehicles",
                vcols,
                "umbral_desvio",
                "umbral_desvio FLOAT NOT NULL DEFAULT 0.15",
            )

        if "field_devices" not in table_names:
            conn.execute(
                text(
                    """
                    CREATE TABLE field_devices (
                        id SERIAL PRIMARY KEY,
                        device_uid VARCHAR(128) NOT NULL UNIQUE,
                        nombre VARCHAR(120) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_field_devices_device_uid ON field_devices (device_uid)"))
            logger.info("Migración: tabla field_devices creada")

        if "admin_users" not in table_names:
            conn.execute(
                text(
                    """
                    CREATE TABLE admin_users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(64) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        full_name VARCHAR(120),
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        last_login_at TIMESTAMPTZ
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX ix_admin_users_username ON admin_users (username)"))
            logger.info("Migración: tabla admin_users creada")
