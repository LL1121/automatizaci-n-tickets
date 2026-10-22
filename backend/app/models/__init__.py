from app.models.admin_user import AdminUser
from app.models.base import Base
from app.models.field_device import FieldDevice, TIPO_COMBUSTIBLE_DEFAULT
from app.models.telemetry import TelemetrySnapshot
from app.models.ticket import Ticket
from app.models.vehicle import Vehicle
from app.models.ypf import YpfMovement

__all__ = [
    "AdminUser",
    "Base",
    "FieldDevice",
    "TelemetrySnapshot",
    "Ticket",
    "TIPO_COMBUSTIBLE_DEFAULT",
    "Vehicle",
    "YpfMovement",
]
