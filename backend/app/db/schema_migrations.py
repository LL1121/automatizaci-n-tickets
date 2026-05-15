"""Ajustes incrementales de esquema (create_all no altera tablas existentes)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def apply_schema_migrations(engine: Engine) -> None:
    insp = inspect(engine)
    table_names = set(insp.get_table_names())

    with engine.begin() as conn:
        if "tickets" in table_names:
            col_names = {c["name"] for c in insp.get_columns("tickets")}

            if "kilometraje" not in col_names:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN kilometraje INTEGER"))
                logger.info("Migración: columna tickets.kilometraje agregada")

            if "monto" in col_names:
                conn.execute(text("ALTER TABLE tickets DROP COLUMN monto"))
                logger.info("Migración: columna tickets.monto eliminada")

            if "tipo_combustible" not in col_names:
                conn.execute(
                    text(
                        "ALTER TABLE tickets ADD COLUMN tipo_combustible VARCHAR(64) "
                        "NOT NULL DEFAULT 'INFINIA DIESEL'"
                    )
                )
                logger.info("Migración: columna tickets.tipo_combustible agregada")

            if "remito" not in col_names:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN remito VARCHAR(64)"))
                logger.info("Migración: columna tickets.remito agregada")

            if "operador_nombre" not in col_names:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN operador_nombre VARCHAR(120)"))
                logger.info("Migración: columna tickets.operador_nombre agregada")

            if "field_device_id" not in col_names:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN field_device_id INTEGER"))
                logger.info("Migración: columna tickets.field_device_id agregada")

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
