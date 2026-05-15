"""Ajustes incrementales de esquema (create_all no altera tablas existentes)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def apply_schema_migrations(engine: Engine) -> None:
    insp = inspect(engine)
    if "tickets" not in insp.get_table_names():
        return

    col_names = {c["name"] for c in insp.get_columns("tickets")}

    with engine.begin() as conn:
        if "kilometraje" not in col_names:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN kilometraje INTEGER"))
            logger.info("Migración: columna tickets.kilometraje agregada")

        if "monto" in col_names:
            conn.execute(text("ALTER TABLE tickets DROP COLUMN monto"))
            logger.info("Migración: columna tickets.monto eliminada")
