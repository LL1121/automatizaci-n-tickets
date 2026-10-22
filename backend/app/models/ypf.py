"""Movimientos del reporte mensual YPF en Ruta."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class YpfMovement(Base):
    __tablename__ = "ypf_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    remito: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    fecha_hora: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estacion: Mapped[str | None] = mapped_column(String(150), nullable=True)
    tarjeta: Mapped[str | None] = mapped_column(String(30), nullable=True)
    conductor_nombre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    conductor_dni: Mapped[str | None] = mapped_column(String(20), nullable=True)
    identificacion_tipo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    identificacion_valor: Mapped[str | None] = mapped_column(String(30), nullable=True)
    odometro: Mapped[int | None] = mapped_column(Integer, nullable=True)
    producto: Mapped[str | None] = mapped_column(String(50), nullable=True)
    litros: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    precio_unitario: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    importe_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    nro_factura: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
