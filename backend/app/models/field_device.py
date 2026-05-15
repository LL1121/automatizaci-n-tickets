from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

TIPO_COMBUSTIBLE_DEFAULT = "INFINIA DIESEL"


class FieldDevice(Base):
    """Dispositivo de campo vinculado a un operario por fingerprint del navegador."""

    __tablename__ = "field_devices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    tickets: Mapped[list["Ticket"]] = relationship("Ticket", back_populates="field_device")
