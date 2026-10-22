"""Lectura del PDF de consumos YPF en Ruta por posición de cada carácter.

El archivo sale de Excel impreso a PDF: el guion del remito es un trazo
mínimo y la fecha/hora quedan en la línea de arriba y la de abajo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

_AR_TZ = ZoneInfo("America/Argentina/Mendoza")
_REMITO_RE = re.compile(r"\d{4}-\d{8}")
_DATE_RE = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
_TIME_RE = re.compile(r"\b(\d{1,2}:\d{2}:\d{2})\b")
_TAIL_RE = re.compile(
    r"(?P<remito>\d{4}-\d{8})\s+"
    r"(?P<litros>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<precio>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<importe>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
    r"(?P<factura>F\S+)"
)
_IDENT_RE = re.compile(
    r"(?P<tipo>PATENTE|DNI)\s+(?P<valor>\S+(?:\s+\S+)?)\s+(?P<odometro>\d+)\s+(?P<remito>\d{4}-\d{8})"
)
_CARD_RE = re.compile(r"(\d{16,20})\s+(?P<nombre>.+?)\s+DNI\s+(?P<dni>\d{6,12})")
_ESTACION_RE = re.compile(r"^(\d{4,5}\s*-\s*.+?(?:S\.R\.L\.|S\s+A|S\.A\.))", re.IGNORECASE)


class YpfParseError(ValueError):
    """El PDF no tiene la tabla de consumos YPF en Ruta."""


@dataclass(frozen=True)
class YpfRow:
    remito: str
    fecha_hora: datetime | None
    estacion: str | None
    tarjeta: str | None
    conductor_nombre: str | None
    conductor_dni: str | None
    identificacion_tipo: str | None
    identificacion_valor: str | None
    odometro: int | None
    producto: str | None
    litros: Decimal | None
    precio_unitario: Decimal | None
    importe_total: Decimal | None
    nro_factura: str | None


def _ar_decimal(raw: str) -> Decimal:
    return Decimal(raw.replace(".", "").replace(",", "."))


def _line_text(items: list[dict]) -> str:
    ordered = sorted(items, key=lambda c: c["l"])
    parts: list[str] = []
    prev_right: float | None = None
    for char in ordered:
        if prev_right is not None and char["l"] - prev_right > 1.8:
            parts.append(" ")
        parts.append(char["ch"])
        prev_right = char["r"]
    return re.sub(r"[ \t]+", " ", "".join(parts)).strip()


def _cluster_lines(chars: list[dict]) -> list[dict]:
    normals = [c for c in chars if c["h"] > 1]
    normals.sort(key=lambda c: -c["b"])
    lines: list[dict] = []
    for char in normals:
        if lines and abs(lines[-1]["y"] - char["b"]) <= 1.6:
            lines[-1]["items"].append(char)
        else:
            lines.append({"y": char["b"], "items": [char]})
    for char in chars:
        if char["h"] > 1:
            continue
        nearest = min(lines, key=lambda line: abs(line["y"] - char["b"]))
        if abs(nearest["y"] - char["b"]) < 4:
            nearest["items"].append(char)
    for line in lines:
        line["text"] = _line_text(line["items"])
    return lines


def _producto(neighbors: list[str]) -> str | None:
    blob = " ".join(neighbors).upper()
    if "INFINIA" in blob and "DIESEL" in blob:
        return "INFINIA DIESEL"
    if "INFINIA" in blob:
        return "INFINIA"
    if "DIESEL" in blob:
        return "DIESEL"
    return None


def _fecha_hora(lines: list[dict], anchor_y: float) -> datetime | None:
    date_raw: str | None = None
    time_raw: str | None = None
    for line in lines:
        delta = line["y"] - anchor_y
        if not (-8 <= delta <= 8) or abs(delta) < 0.4:
            continue
        if delta > 0 and date_raw is None:
            found = _DATE_RE.search(line["text"])
            if found:
                date_raw = found.group(1)
        if delta < 0 and time_raw is None:
            found = _TIME_RE.search(line["text"])
            if found:
                time_raw = found.group(1)
    if not date_raw:
        return None
    stamp = f"{date_raw} {time_raw or '00:00:00'}"
    try:
        parsed = datetime.strptime(stamp, "%d/%m/%Y %H:%M:%S")
    except ValueError:
        return None
    return parsed.replace(tzinfo=_AR_TZ)


def _row_from_line(text: str, fecha_hora: datetime | None, producto: str | None) -> YpfRow | None:
    tail = _TAIL_RE.search(text)
    if tail is None:
        return None
    ident = _IDENT_RE.search(text)
    card = _CARD_RE.search(text)
    estacion = _ESTACION_RE.search(text)
    odometro = int(ident.group("odometro")) if ident else None
    return YpfRow(
        remito=tail.group("remito"),
        fecha_hora=fecha_hora,
        estacion=(estacion.group(1).strip()[:150] if estacion else None),
        tarjeta=(card.group(1)[:30] if card else None),
        conductor_nombre=(card.group("nombre").strip()[:100] if card else None),
        conductor_dni=(card.group("dni")[:20] if card else None),
        identificacion_tipo=(ident.group("tipo")[:20] if ident else None),
        identificacion_valor=(ident.group("valor").strip()[:30] if ident else None),
        odometro=odometro,
        producto=producto,
        litros=_ar_decimal(tail.group("litros")),
        precio_unitario=_ar_decimal(tail.group("precio")),
        importe_total=_ar_decimal(tail.group("importe")),
        nro_factura=tail.group("factura")[:50],
    )


def parse_ypf_pdf(pdf_bytes: bytes) -> list[YpfRow]:
    if not pdf_bytes:
        raise YpfParseError("El PDF está vacío.")
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:  # pragma: no cover
        raise YpfParseError("No se puede leer el PDF en este servidor.") from exc

    try:
        document = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:  # noqa: BLE001
        raise YpfParseError("No se pudo abrir el PDF.") from exc

    rows: list[YpfRow] = []
    seen: set[str] = set()
    try:
        for page in document:
            textpage = page.get_textpage()
            chars: list[dict] = []
            for index in range(textpage.count_chars()):
                glyph = textpage.get_text_range(index, 1)
                left, bottom, right, top = textpage.get_charbox(index)
                if not glyph:
                    continue
                chars.append(
                    {"l": left, "b": bottom, "r": right, "t": top, "ch": glyph, "h": top - bottom}
                )
            if not chars:
                continue
            lines = _cluster_lines(chars)
            for line in lines:
                if not _REMITO_RE.search(line["text"]):
                    continue
                neighbors = [
                    other["text"]
                    for other in lines
                    if other is not line and abs(other["y"] - line["y"]) <= 8
                ]
                parsed = _row_from_line(line["text"], _fecha_hora(lines, line["y"]), _producto(neighbors))
                if parsed is None or parsed.remito in seen:
                    continue
                seen.add(parsed.remito)
                rows.append(parsed)
    finally:
        document.close()

    if not rows:
        raise YpfParseError("No encontré remitos de YPF en Ruta en ese PDF.")
    return rows
