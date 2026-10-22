"""
Alta del padrón oficial (idempotente).

Uso local:
  cd backend && python -m app.cli.ensure_fleet

En Docker (desde la raíz del repo):
  ./scripts/ensure-fleet.sh
  docker compose exec api python -m app.cli.ensure_fleet
"""

from __future__ import annotations

import logging
import sys

from app.db.session import get_session_factory, verify_database_connection
from app.services.seed_vehicles import OFFICIAL_FLEET, ensure_fleet_vehicles

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    verify_database_connection()
    db = get_session_factory()()
    try:
        sync = ensure_fleet_vehicles(db)
    except Exception:
        db.rollback()
        logger.exception("Error al registrar patentes")
        return 1
    finally:
        db.close()

    if sync.added:
        print("Patentes agregadas:")
        for patente in sync.added:
            print(f"  + {patente}")
    if sync.updated:
        print("Patentes actualizadas:")
        for patente in sync.updated:
            print(f"  ~ {patente}")
    if sync.removed:
        print("Patentes fuera del padrón (tickets conservados):")
        for patente in sync.removed:
            print(f"  - {patente}")
    if not sync.added and not sync.updated and not sync.removed:
        print("Sin cambios: el padrón oficial ya estaba en la base.")

    print("\nFlota oficial:")
    for unit in OFFICIAL_FLEET:
        print(f"  · {unit.patente} — {unit.alias} — {unit.capacidad_tanque:g} L — {unit.unidad_medida}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
