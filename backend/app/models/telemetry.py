"""Lecturas de Pressa guardadas para cruzarlas con la fecha del ticket."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TelemetrySnapshot(Base):
    __tablename__ = "telemetry_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    odometer_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    engine_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    liters: Mapped[float | None] = mapped_column(Float, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    event_description: Mapped[str | None] = mapped_column(String(160), nullable=True)
    event_timestamp: Mapped[str | None] = mapped_column(String(40), nullable=True)
