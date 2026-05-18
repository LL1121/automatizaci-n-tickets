"""
Alta manual de patentes de la flota (idempotente).

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
from app.services.seed_vehicles import FLEET_PATENTES, ensure_fleet_vehicles

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    verify_database_connection()
    db = get_session_factory()()
    try:
        added = ensure_fleet_vehicles(db)
    except Exception:
        db.rollback()
        logger.exception("Error al registrar patentes")
        return 1
    finally:
        db.close()

    if added:
        print("Patentes agregadas:")
        for p in added:
            print(f"  + {p}")
    else:
        print("Sin cambios: todas las patentes de la flota ya estaban en la base.")

    print("\nFlota configurada en el script:")
    for patente, cap in FLEET_PATENTES:
        mark = " (nueva)" if patente in added else ""
        cap_txt = f"{cap} L" if cap is not None else "sin capacidad"
        print(f"  · {patente} — {cap_txt}{mark}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
