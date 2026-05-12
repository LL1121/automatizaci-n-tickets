from __future__ import annotations

from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.ticket import Ticket


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patente: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    capacidad_tanque: Mapped[float | None] = mapped_column(Float, nullable=True)

    tickets: Mapped[list[Ticket]] = relationship(
        "Ticket",
        back_populates="vehicle",
        lazy="selectin",
    )
