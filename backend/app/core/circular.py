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


def etiqueta_tipo_vehiculo(tipo: str | None, modelo: str | None = None) -> str:
    """Texto de la columna TIPO: categoría, o el tipo de máquina si está cargado."""
    if tipo == "maquinaria":
        nombre = " ".join((modelo or "").split())
        return nombre or VEHICLE_TIPO_LABELS["maquinaria"]
    if tipo:
        return VEHICLE_TIPO_LABELS.get(tipo, tipo)
    return " ".join((modelo or "").split())

MESES_MAYUSCULA: tuple[str, ...] = (
    "",
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
)

# Columnas A–K de app/templates/SEPTIEMBRE.xlsx. La planilla oficial se copia de ese archivo.
PLANILLA_HEADERS: tuple[str, ...] = (
    "FECHA",
    "LEGAJO",
    "APELLIDO Y NOMBRE",
    "TIPO DE ACTIVIDAD",
    "TIPO",
    "PATENTE",
    "KM/ RECORRIDO",
    "CARGA LTS",
    "TIPO DE COMBUSTIBLE",
    "ESTACION DE SERVICIO",
    "OBSERVACIONES",
)

PLANILLA_WIDTHS: tuple[float, ...] = (13, 13, 23, 23, 16, 13, 14, 13, 18, 28, 20)
