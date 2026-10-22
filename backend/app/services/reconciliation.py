"""Cruce del reporte YPF en Ruta contra los tickets cargados."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.ticket import Ticket
from app.models.ypf import YpfMovement
from app.services.plate import normalize_patente
from app.services.telemetry import apply_telemetry_flags
from app.services.ypf_parser import YpfParseError, YpfRow, parse_ypf_pdf

_AR_TZ = ZoneInfo("America/Argentina/Mendoza")
_REMITO_RE = re.compile(r"(\d{4})-?(\d{8})")
_LITROS_FALLBACK = Decimal("0.5")
_LITROS_DISCREPANCIA = Decimal("0.1")


def remito_key(raw: str | None) -> str:
    if not raw:
        return ""
    compact = re.sub(r"\s+", "", str(raw))
    found = _REMITO_RE.search(compact)
    if not found:
        return ""
    return f"{found.group(1)}-{found.group(2)}"


def _digits(raw: str | None) -> str:
    return re.sub(r"\D", "", raw or "")


def _as_decimal(value: Decimal | float | int | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _same_day(ticket_fecha: datetime | None, movimiento: datetime | None) -> bool:
    if ticket_fecha is None or movimiento is None:
        return False
    ticket_local = ticket_fecha if ticket_fecha.tzinfo else ticket_fecha.replace(tzinfo=_AR_TZ)
    mov_local = movimiento if movimiento.tzinfo else movimiento.replace(tzinfo=_AR_TZ)
    return ticket_local.astimezone(_AR_TZ).date() == mov_local.astimezone(_AR_TZ).date()


def _litros_cerca(ticket_litros: Decimal | None, ypf_litros: Decimal | None, tolerancia: Decimal) -> bool:
    if ticket_litros is None or ypf_litros is None:
        return False
    return abs(ticket_litros - ypf_litros) <= tolerancia


def _fallback_ok(ticket: Ticket, row: YpfRow) -> bool:
    if not _same_day(ticket.fecha, row.fecha_hora):
        return False
    if not _litros_cerca(_as_decimal(ticket.litros), row.litros, _LITROS_FALLBACK):
        return False
    tipo = (row.identificacion_tipo or "").upper()
    if tipo == "DNI":
        return bool(_digits(row.identificacion_valor)) and _digits(row.identificacion_valor) == _digits(
            ticket.legajo_conductor
        )
    placa = normalize_patente(row.identificacion_valor or "")
    vehiculo = normalize_patente(ticket.vehicle.patente) if ticket.vehicle is not None else ""
    return bool(placa) and placa == vehiculo


def _aplicar_match(ticket: Ticket, movement: YpfMovement) -> bool:
    ticket.ypf_movement_id = movement.id
    ticket.match_ypf_ruta = True
    ticket_litros = _as_decimal(ticket.litros)
    ypf_litros = _as_decimal(movement.litros)
    if ticket_litros is None or ypf_litros is None:
        ticket.discrepancia_litros = False
    else:
        ticket.discrepancia_litros = abs(ticket_litros - ypf_litros) > _LITROS_DISCREPANCIA
    if ticket.precio_unitario is None and movement.precio_unitario is not None:
        ticket.precio_unitario = movement.precio_unitario
    if not ticket.nro_factura and movement.nro_factura:
        ticket.nro_factura = movement.nro_factura
    if ticket.monto is None and movement.importe_total is not None:
        ticket.monto = movement.importe_total
    return bool(ticket.discrepancia_litros)


def _mas_cercano(candidatos: list[Ticket], litros: Decimal | None) -> Ticket | None:
    if not candidatos:
        return None
    if litros is None or len(candidatos) == 1:
        return candidatos[0]
    return min(
        candidatos,
        key=lambda ticket: abs((_as_decimal(ticket.litros) or Decimal(0)) - litros),
    )


def _elegir_fallback(tickets: list[Ticket], row: YpfRow, ocupados: set[int]) -> Ticket | None:
    candidatos = [ticket for ticket in tickets if ticket.id not in ocupados and _fallback_ok(ticket, row)]
    if row.litros is None and len(candidatos) != 1:
        return None
    return _mas_cercano(candidatos, row.litros)


def reconcile_ypf_pdf(db: Session, pdf_bytes: bytes) -> dict[str, int]:
    rows = parse_ypf_pdf(pdf_bytes)
    tickets = db.scalars(select(Ticket).options(selectinload(Ticket.vehicle))).all()
    por_remito: dict[str, list[Ticket]] = {}
    for ticket in tickets:
        for raw in (ticket.remito, ticket.nro_ticket):
            key = remito_key(raw)
            if key:
                por_remito.setdefault(key, []).append(ticket)

    ocupados = {ticket.id for ticket in tickets if ticket.ypf_movement_id is not None}
    conciliados = 0
    discrepancias = 0

    for row in rows:
        movement = db.scalar(select(YpfMovement).where(YpfMovement.remito == row.remito))
        if movement is None:
            movement = YpfMovement(
                remito=row.remito,
                fecha_hora=row.fecha_hora,
                estacion=row.estacion,
                tarjeta=row.tarjeta,
                conductor_nombre=row.conductor_nombre,
                conductor_dni=row.conductor_dni,
                identificacion_tipo=row.identificacion_tipo,
                identificacion_valor=row.identificacion_valor,
                odometro=row.odometro,
                producto=row.producto,
                litros=row.litros,
                precio_unitario=row.precio_unitario,
                importe_total=row.importe_total,
                nro_factura=row.nro_factura,
            )
            db.add(movement)
            db.flush()

        ya = next((ticket for ticket in tickets if ticket.ypf_movement_id == movement.id), None)
        if ya is not None:
            apply_telemetry_flags(db, ya)
            ocupados.add(ya.id)
            conciliados += 1
            if ya.discrepancia_litros:
                discrepancias += 1
            continue

        exactos = [ticket for ticket in por_remito.get(row.remito, []) if ticket.id not in ocupados]
        elegido = _mas_cercano(exactos, row.litros) or _elegir_fallback(tickets, row, ocupados)
        if elegido is None:
            continue
        if _aplicar_match(elegido, movement):
            discrepancias += 1
        apply_telemetry_flags(db, elegido)
        ocupados.add(elegido.id)
        conciliados += 1

    db.commit()
    total = len(rows)
    return {
        "total_ypf": total,
        "conciliados": conciliados,
        "sin_ticket": total - conciliados,
        "discrepancias": discrepancias,
    }


__all__ = ["YpfParseError", "reconcile_ypf_pdf", "remito_key"]
