"""Constantes y helpers de la Circular 08/2026 (control de combustible)."""

from __future__ import annotations

ACTIVIDAD_OPCIONES: tuple[str, ...] = (
    "Traslado oficial",
    "Mantenimiento de red",
    "Emergencia hídrica",
    "Obra",
    "Control / inspección",
    "Otro",
)

ACTIVIDAD_SET = frozenset(ACTIVIDAD_OPCIONES)

VEHICLE_TIPO_LABELS: dict[str, str] = {
    "liviano": "Liviano",
    "camioneta": "Camioneta",
    "camion": "Camión",
    "maquinaria": "Maquinaria",
}

PLANILLA_HEADERS: tuple[str, ...] = (
    "Fecha",
    "Legajo",
    "Apellido y Nombre",
    "Actividad",
    "Tipo",
    "Patente",
    "Km/Hs inicio",
    "Km/Hs final",
    "Carga Lts",
    "Estación",
    "Monto",
)
