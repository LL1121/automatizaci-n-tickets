"use client";

import type { AdminTicketRow } from "@/lib/admin-api";
import { patchAdminTicket, ticketImageUrl } from "@/lib/admin-api";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { ModalBackdrop } from "@/components/ui/ModalBackdrop";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  ticket: AdminTicketRow;
  onClose: () => void;
  onSaved: (row: AdminTicketRow) => void;
};

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminTicketPanel({ ticket, onClose, onSaved }: Props) {
  const [litros, setLitros] = useState(ticket.litros != null ? String(ticket.litros) : "");
  const [kilometraje, setKilometraje] = useState(ticket.kilometraje != null ? String(ticket.kilometraje) : "");
  const [kmOHoras, setKmOHoras] = useState(ticket.km_o_horas != null ? String(ticket.km_o_horas) : "");
  const [fechaLocal, setFechaLocal] = useState(toDatetimeLocalValue(ticket.fecha));
  const [legajo, setLegajo] = useState(ticket.legajo_conductor ?? "");
  const [nombre, setNombre] = useState(ticket.nombre_conductor ?? "");
  const [actividad, setActividad] = useState(ticket.tipo_actividad ?? "");
  const [estacion, setEstacion] = useState(ticket.estacion_servicio ?? "");
  const [monto, setMonto] = useState(ticket.monto != null ? String(ticket.monto) : "");
  const [tipoCombustible, setTipoCombustible] = useState(ticket.tipo_combustible ?? "");
  const [verified, setVerified] = useState(ticket.is_verified);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (imageZoom) setImageZoom(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, imageZoom]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Parameters<typeof patchAdminTicket>[1] = {
        is_verified: verified,
        legajo_conductor: legajo.trim() || null,
        nombre_conductor: nombre.trim() || null,
        tipo_actividad: actividad.trim() || null,
        estacion_servicio: estacion.trim() || null,
        tipo_combustible: tipoCombustible.trim() || null,
      };
      if (litros.trim() === "") body.litros = null;
      else body.litros = Number.parseFloat(litros.replace(",", "."));
      if (kilometraje.trim() === "") body.kilometraje = null;
      else body.kilometraje = Number.parseInt(kilometraje.replace(/\D/g, ""), 10);
      if (kmOHoras.trim() === "") body.km_o_horas = null;
      else body.km_o_horas = Number.parseFloat(kmOHoras.replace(",", "."));
      if (monto.trim() === "") body.monto = null;
      else body.monto = Number.parseFloat(monto.replace(",", "."));
      if (fechaLocal.trim() === "") body.fecha = null;
      else body.fecha = new Date(fechaLocal).toISOString();

      if (body.litros != null && Number.isNaN(body.litros)) throw new Error("Litros inválidos");
      if (body.kilometraje != null && Number.isNaN(body.kilometraje)) throw new Error("Kilometraje inválido");
      if (body.km_o_horas != null && Number.isNaN(body.km_o_horas)) throw new Error("Km/Hs inválido");
      if (body.monto != null && Number.isNaN(body.monto)) throw new Error("Monto inválido");

      const updated = await patchAdminTicket(ticket.id, body);
      onSaved(updated as AdminTicketRow);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalBackdrop open onClose={onClose} zIndex={50} />
      {createPortal(
        <div
          className="fixed inset-0 z-[51] flex justify-end p-4 pointer-events-none"
          role="dialog"
          aria-modal
          aria-labelledby="admin-ticket-title"
        >
          <div className="pointer-events-auto flex h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-field-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-field-border bg-field-surface px-5 py-4">
              <h2 id="admin-ticket-title" className="text-lg font-semibold text-brand">
                Ticket #{ticket.id}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1 text-sm text-field-muted hover:bg-brand-light hover:text-field-accent"
              >
                Cerrar
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
              {(ticket.rendicion_tardia || ticket.desvio_detectado) && (
                <div className="flex flex-wrap gap-2">
                  {ticket.rendicion_tardia ? (
                    <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">
                      Rendición tardía (&gt; 48 h hábiles)
                    </span>
                  ) : null}
                  {ticket.desvio_detectado ? (
                    <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white">
                      Desvío de consumo
                      {ticket.desvio_pct != null ? ` (${(ticket.desvio_pct * 100).toFixed(0)}%)` : ""}
                    </span>
                  ) : null}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setImageZoom(true)}
                  className="group overflow-hidden rounded-xl border border-field-border bg-field-surface text-left ring-brand/0 transition hover:ring-2 hover:ring-brand/30"
                  aria-label="Ampliar foto del ticket"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ticketImageUrl(ticket.id)}
                    alt="Ticket"
                    className="max-h-96 w-full object-contain transition group-hover:opacity-95"
                  />
                  <p className="border-t border-field-border px-3 py-2 text-center text-xs text-field-muted group-hover:text-field-accent">
                    Tocá para maximizar
                  </p>
                </button>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-field-muted">CUIT</span>
                    <p className="font-mono text-field-text">{ticket.cuit_proveedor}</p>
                  </div>
                  <div>
                    <span className="text-field-muted">Nº ticket</span>
                    <p className="font-mono text-field-text">{ticket.nro_ticket}</p>
                  </div>
                  <div>
                    <span className="text-field-muted">Patente</span>
                    <p className="font-mono text-field-text">{ticket.patente ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-field-muted">Operario (dispositivo)</span>
                    <p className="text-field-text">{ticket.operador_nombre ?? "—"}</p>
                  </div>
                  <label className="block">
                    <span className="text-field-muted">Combustible</span>
                    <input
                      value={tipoCombustible}
                      onChange={(e) => setTipoCombustible(e.target.value)}
                      className="input-field !min-h-0 mt-1 py-2"
                      placeholder="INFINIA DIESEL"
                    />
                  </label>
                  <div>
                    <span className="text-field-muted">Remito</span>
                    <p className="font-mono text-field-text">{ticket.remito ?? "No encontrado"}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-field-border pt-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-field-muted">Legajo conductor</span>
                  <input
                    value={legajo}
                    onChange={(e) => setLegajo(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-field-muted">Apellido y nombre</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-field-muted">Tipo de actividad</span>
                  <input
                    value={actividad}
                    onChange={(e) => setActividad(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                    maxLength={160}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-field-muted">Estación de servicio</span>
                  <input
                    value={estacion}
                    onChange={(e) => setEstacion(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-field-muted">Litros</span>
                  <input
                    type="number"
                    step="0.001"
                    value={litros}
                    onChange={(e) => setLitros(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-field-muted">Monto ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-field-muted">Km (IA)</span>
                  <input
                    type="number"
                    step="1"
                    value={kilometraje}
                    onChange={(e) => setKilometraje(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-field-muted">Km/Hs oficial</span>
                  <input
                    type="number"
                    step="0.001"
                    value={kmOHoras}
                    onChange={(e) => setKmOHoras(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-field-muted">Fecha del ticket</span>
                  <input
                    type="datetime-local"
                    value={fechaLocal}
                    onChange={(e) => setFechaLocal(e.target.value)}
                    className="input-field !min-h-0 mt-1 py-2"
                  />
                </label>
                <label className="flex items-center gap-3 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                    className="h-5 w-5 rounded border-field-border text-field-accent"
                  />
                  <span className={verified ? "text-status-verifiedText" : "text-field-muted"}>
                    Verificado (revisión humana)
                  </span>
                </label>
              </div>

              {err ? <p className="text-sm text-field-danger">{err}</p> : null}

              <div className="mt-auto flex gap-3 border-t border-field-border pt-4">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="btn-primary min-h-12 flex-1 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
                <button type="button" onClick={onClose} className="btn-secondary min-h-12 px-6">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {imageZoom ? (
        <ImageLightbox
          open={imageZoom}
          src={ticketImageUrl(ticket.id)}
          alt={`Ticket #${ticket.id}`}
          onClose={() => setImageZoom(false)}
        />
      ) : null}
    </>
  );
}
