"use client";

import { listInboxTickets, type PendingTicketRecord } from "@/lib/offline-db";
import {
  deleteInboxTicket,
  retryPendingTicket,
  type FlushResult,
} from "@/lib/sync-queue";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  onBack: () => void;
  onChanged?: () => void;
};

function statusLabel(row: PendingTicketRecord): string {
  switch (row.status) {
    case "pending":
      return "Pendiente";
    case "uploading":
      return "Subiendo…";
    case "quota_blocked":
      return "Cuota IA agotada";
    case "failed":
      return "Error";
    default:
      return row.status;
  }
}

function statusClass(row: PendingTicketRecord): string {
  switch (row.status) {
    case "quota_blocked":
      return "bg-red-100 text-red-800";
    case "failed":
      return "bg-status-pendingBg text-status-pendingText";
    case "uploading":
      return "bg-brand-light text-brand";
    default:
      return "bg-field-surface text-field-muted";
  }
}

function blobUrlFor(row: PendingTicketRecord): string {
  const blob = new Blob([row.imageBuffer], { type: row.mimeType || "image/jpeg" });
  return URL.createObjectURL(blob);
}

export function PendingInbox({ onBack, onChanged }: Props) {
  const [rows, setRows] = useState<PendingTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PendingTicketRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const thumbUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.id, blobUrlFor(row));
    }
    return map;
  }, [rows]);

  useEffect(() => {
    return () => {
      thumbUrls.forEach((url) => URL.revokeObjectURL(url));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [thumbUrls, previewUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listInboxTickets());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPreview = (row: PendingTicketRecord) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = blobUrlFor(row);
    setPreviewUrl(url);
    setPreview(row);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreview(null);
  };

  const afterAction = async (result: FlushResult) => {
    await load();
    onChanged?.();
    if (result.uploaded > 0) {
      setMsg("Ticket subido correctamente.");
    } else if (result.errors.length > 0) {
      setMsg(result.errors[0] ?? "No se pudo subir.");
    }
    window.setTimeout(() => setMsg(null), 5000);
  };

  const uploadOne = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      const result = await retryPendingTicket(id);
      await afterAction(result);
    } finally {
      setBusyId(null);
    }
  };

  const removeOne = async (id: string) => {
    if (!window.confirm("¿Eliminar este ticket pendiente del dispositivo?")) return;
    await deleteInboxTicket(id);
    await load();
    onChanged?.();
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-field-accent hover:underline"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-semibold text-brand">Pendientes</h2>
        <p className="mt-2 text-sm text-field-muted">
          Las fotos se suben <strong className="font-medium text-field-text">solo cuando tocás Subir</strong> (una por
          vez, para no gastar cuota de IA).
        </p>
      </div>

      {msg ? (
        <div className="rounded-xl border border-brand/20 bg-brand-light px-4 py-3 text-sm text-brand">
          {msg}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-field-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-field-muted">
          No hay tickets pendientes en este dispositivo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const thumb = thumbUrls.get(row.id);
            const busy = busyId === row.id;
            const canUpload =
              row.status !== "uploading" &&
              (row.status === "pending" ||
                row.status === "failed" ||
                row.status === "quota_blocked");
            return (
              <li
                key={row.id}
                className="card p-4"
              >
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => openPreview(row)}
                    className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-field-border bg-black"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="Ticket" className="h-full w-full object-cover" />
                    ) : null}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-field-text">{row.patente || "—"}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row)}`}
                      >
                        {statusLabel(row)}
                      </span>
                    </div>
                    <p className="text-xs text-field-muted">
                      {new Date(row.createdAt).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    {row.lastError ? (
                      <p className="line-clamp-2 text-xs text-field-muted">{row.lastError}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {canUpload ? (
                        <button
                          type="button"
                          disabled={busy || busyId != null}
                          onClick={() => void uploadOne(row.id)}
                          className="btn-primary min-h-touch flex-1 !py-2 text-sm disabled:opacity-50"
                        >
                          {busy ? "Subiendo…" : "Subir (1 token)"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeOne(row.id)}
                        className="btn-secondary min-h-touch !py-2 text-sm"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && previewUrl ? (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 safe-pt safe-pb"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={closePreview}
            className="mb-4 self-start text-sm text-white underline"
          >
            Cerrar
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Vista del ticket"
            className="mx-auto max-h-[70dvh] w-full object-contain"
          />
          <p className="mt-4 text-center font-mono text-sm text-zinc-300">{preview.patente}</p>
        </motion.div>
      ) : null}
    </div>
  );
}
