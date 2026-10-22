"""Padrón oficial de Malargüe. Al arrancar el API deja solo estas unidades."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.vehicle import Vehicle, consumo_de_medida
from app.services.plate import normalize_patente

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FleetUnit:
    patente: str
    alias: str
    dominio_pressa: str
    tipo: str
    capacidad_tanque: float
    unidad_medida: str
    modelo: str | None = None


@dataclass(frozen=True)
class FleetSync:
    added: list[str]
    updated: list[str]
    removed: list[str]


# SANY-SY215C conserva el guion: el normalizador lo borraría.
OFFICIAL_FLEET: tuple[FleetUnit, ...] = (
    FleetUnit("GKD427", "CAMION RENAULT", "GKD 427", "camion", 380, "KM"),
    FleetUnit("PLH110", "HILUX 110 J MAQ", "PLH 110", "camioneta", 80, "KM"),
    FleetUnit("EVF245", "HILUX 245 DIQUE", "EVF 245", "camioneta", 80, "KM"),
    FleetUnit("AH715QW", "IVECO CARRETON HI WAY", "AH715QW", "camion", 600, "KM"),
    FleetUnit("AG220PF", "IVECO TECTOR BATEA PF", "AG220PF", "camion", 236, "KM"),
    FleetUnit("EVA71", "JCB 3CX", "EVA 71", "maquinaria", 160, "HORAS", "Retroexcavadora"),
    FleetUnit("AG975ZC", "RANGER ZC", "AG975ZC", "camioneta", 80, "KM"),
    FleetUnit("AC979ML", "S10 ML SUB MALARGUE", "AC979ML", "camioneta", 76, "KM"),
    FleetUnit("SANY-SY215C", "SANY SY215C M", "SIN DOM", "maquinaria", 335, "HORAS", "Excavadora"),
)


def fleet_storage_key(patente: str) -> str:
    """Clave de padrón. La SANY no pasa por el normalizador."""
    compact = patente.strip().upper().replace(" ", "")
    if compact in {"SANY-SY215C", "SANYSY215C"}:
        return "SANY-SY215C"
    return normalize_patente(patente)


def ensure_fleet_vehicles(db: Session) -> FleetSync:
    """Deja solo las 9 unidades y actualiza tanque, tipo, unidad, alias y dominio Pressa."""
    existing = {fleet_storage_key(v.patente): v for v in db.scalars(select(Vehicle)).all()}
    official_keys = {fleet_storage_key(unit.patente) for unit in OFFICIAL_FLEET}
    added: list[str] = []
    updated: list[str] = []
    removed: list[str] = []

    for unit in OFFICIAL_FLEET:
        key = fleet_storage_key(unit.patente)
        current = existing.get(key)
        fields = {
            "patente": unit.patente,
            "alias": unit.alias,
            "dominio_pressa": unit.dominio_pressa,
            "tipo": unit.tipo,
            "capacidad_tanque": unit.capacidad_tanque,
            "unidad_medida": unit.unidad_medida,
            "unidad_consumo": consumo_de_medida(unit.unidad_medida),
        }
        if current is None:
            db.add(Vehicle(**fields, modelo=unit.modelo))
            added.append(unit.patente)
            continue
        changed = False
        for name, value in fields.items():
            if getattr(current, name) != value:
                setattr(current, name, value)
                changed = True
        if unit.modelo is not None and current.modelo != unit.modelo:
            current.modelo = unit.modelo
            changed = True
        if changed:
            updated.append(unit.patente)

    for key, vehicle in existing.items():
        if key not in official_keys:
            removed.append(vehicle.patente)
            db.delete(vehicle)

    if added or updated or removed:
        db.commit()
        logger.info(
            "Flota oficial: +%s ~%s -%s",
            ", ".join(added) or "—",
            ", ".join(updated) or "—",
            ", ".join(removed) or "—",
        )
    return FleetSync(added=added, updated=updated, removed=removed)
