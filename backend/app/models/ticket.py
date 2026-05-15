from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String, UniqueConstraint, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint(
            "cuit_proveedor",
            "nro_ticket",
            name="uq_ticket_cuit_nro",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cuit_proveedor: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    nro_ticket: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    litros: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    kilometraje: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    url_imagen: Mapped[str] = mapped_column(String(1024), nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false(), default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vehicle: Mapped["Vehicle | None"] = relationship("Vehicle", back_populates="tickets")
