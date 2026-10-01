from __future__ import annotations

from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.ticket import Ticket

# liviano | camioneta | camion | maquinaria
VEHICLE_TIPOS = frozenset({"liviano", "camioneta", "camion", "maquinaria"})
# l_100km | l_hora
UNIDADES_CONSUMO = frozenset({"l_100km", "l_hora"})


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patente: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    capacidad_tanque: Mapped[float | None] = mapped_column(Float, nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    consumo_esperado: Mapped[float | None] = mapped_column(Float, nullable=True)
    unidad_consumo: Mapped[str | None] = mapped_column(String(16), nullable=True, default="l_100km")
    umbral_desvio: Mapped[float] = mapped_column(Float, nullable=False, default=0.15, server_default="0.15")

    tickets: Mapped[list[Ticket]] = relationship(
        "Ticket",
        back_populates="vehicle",
        lazy="selectin",
    )
