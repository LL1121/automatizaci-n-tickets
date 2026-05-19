"use client";

import type { AdminTicketRow } from "@/lib/admin-api";
import { patchAdminTicket, ticketImageUrl } from "@/lib/admin-api";
import { useEffect, useState } from "react";

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
  const [fechaLocal, setFechaLocal] = useState(toDatetimeLocalValue(ticket.fecha));
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
      const body: {
        litros?: number | null;
        kilometraje?: number | null;
        fecha?: string | null;
        is_verified?: boolean;
      } = {
        is_verified: verified,
      };
      if (litros.trim() === "") body.litros = null;
      else body.litros = Number.parseFloat(litros.replace(",", "."));
      if (kilometraje.trim() === "") body.kilometraje = null;
      else body.kilometraje = Number.parseInt(kilometraje.replace(/\D/g, ""), 10);
      if (fechaLocal.trim() === "") body.fecha = null;
      else body.fecha = new Date(fechaLocal).toISOString();

      if (body.litros != null && Number.isNaN(body.litros)) throw new Error("Litros inválidos");
      if (body.kilometraje != null && Number.isNaN(body.kilometraje)) throw new Error("Kilometraje inválido");

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
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal>
        <div className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-field-border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-field-border bg-field-surface px-5 py-4">
            <h2 className="text-lg font-semibold text-brand">Ticket #{ticket.id}</h2>
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-field-muted hover:bg-brand-light hover:text-field-accent">
              Cerrar
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
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
                  <span className="text-field-muted">Operario</span>
                  <p className="text-field-text">{ticket.operador_nombre ?? "—"}</p>
                </div>
                <div>
                  <span className="text-field-muted">Combustible</span>
                  <p className="text-field-text">{ticket.tipo_combustible ?? "INFINIA DIESEL"}</p>
                </div>
                <div>
                  <span className="text-field-muted">Remito</span>
                  <p className="font-mono text-field-text">{ticket.remito ?? "No encontrado"}</p>
                </div>
                <div>
                  <span className="text-field-muted">Confianza IA</span>
                  <p className={ticket.confidence_score != null && ticket.confidence_score < 0.75 ? "text-field-danger" : "text-field-text"}>
                    {ticket.confidence_score != null ? `${(ticket.confidence_score * 100).toFixed(0)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-field-border pt-4 md:grid-cols-2">
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
                <span className="text-field-muted">Kilometraje (Km)</span>
                <input
                  type="number"
                  step="1"
                  value={kilometraje}
                  onChange={(e) => setKilometraje(e.target.value)}
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
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-5 w-5 rounded border-field-border text-field-accent" />
                <span className={verified ? "text-status-verifiedText" : "text-field-muted"}>Verificado (revisión humana)</span>
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
      </div>

      {imageZoom ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/95 p-4"
          role="dialog"
          aria-modal
          aria-label="Vista ampliada del ticket"
          onClick={() => setImageZoom(false)}
        >
          <div className="flex shrink-0 items-center justify-between pb-3">
            <p className="text-sm text-zinc-400">Ticket #{ticket.id} · ESC para cerrar</p>
            <button
              type="button"
              onClick={() => setImageZoom(false)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-field-text hover:bg-zinc-700"
            >
              Cerrar
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ticketImageUrl(ticket.id)}
              alt="Ticket ampliado"
              className="max-h-full max-w-full object-contain"
              onClick={() => setImageZoom(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
