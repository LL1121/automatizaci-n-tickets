from __future__ import annotations

from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.ticket import Ticket

# liviano | camioneta | camion | maquinaria
VEHICLE_TIPOS = frozenset({"liviano", "camioneta", "camion", "maquinaria"})
# l_100km | l_hora
UNIDADES_CONSUMO = frozenset({"l_100km", "l_hora"})
# KM | HORAS — la lectura del odómetro o del horómetro
UNIDADES_MEDIDA = frozenset({"KM", "HORAS"})


def consumo_de_medida(unidad_medida: str | None) -> str:
    """KM se compara en L/100 km; HORAS, en L/hora."""
    if (unidad_medida or "").strip().upper() == "HORAS":
        return "l_hora"
    return "l_100km"


def medida_de_consumo(unidad_consumo: str | None) -> str:
    if (unidad_consumo or "").strip().lower() == "l_hora":
        return "HORAS"
    return "KM"


def es_unidad_horas(unidad_medida: str | None, unidad_consumo: str | None = None) -> bool:
    medida = (unidad_medida or "").strip().upper()
    if medida in UNIDADES_MEDIDA:
        return medida == "HORAS"
    return (unidad_consumo or "").strip().lower() == "l_hora"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patente: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    alias: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dominio_pressa: Mapped[str | None] = mapped_column(String(40), nullable=True)
    capacidad_tanque: Mapped[float | None] = mapped_column(Float, nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    consumo_esperado: Mapped[float | None] = mapped_column(Float, nullable=True)
    unidad_medida: Mapped[str] = mapped_column(String(8), nullable=False, default="KM", server_default="KM")
    unidad_consumo: Mapped[str | None] = mapped_column(String(16), nullable=True, default="l_100km")
    umbral_desvio: Mapped[float] = mapped_column(Float, nullable=False, default=0.15, server_default="0.15")

    tickets: Mapped[list[Ticket]] = relationship(
        "Ticket",
        back_populates="vehicle",
        lazy="selectin",
    )
