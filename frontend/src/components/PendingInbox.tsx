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
      return "text-rose-400 bg-rose-500/15";
    case "failed":
      return "text-amber-300 bg-amber-500/15";
    case "uploading":
      return "text-cyan-300 bg-cyan-500/15";
    default:
      return "text-zinc-400 bg-zinc-700/40";
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
    <motion.div className="flex flex-1 flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-field-accent hover:underline"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-semibold text-white">Pendientes</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Las fotos se suben <strong className="font-medium text-zinc-300">solo cuando tocás Subir</strong> (una por
          vez, para no gastar cuota de IA).
        </p>
      </div>

      {msg ? (
        <motion.div className="rounded-xl border border-field-border bg-field-surface px-4 py-3 text-sm text-field-accent">
          {msg}
        </motion.div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-field-border bg-field-surface p-6 text-center text-sm text-zinc-500">
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
                className="rounded-2xl border border-field-border bg-field-surface p-4"
              >
                <motion.div className="flex gap-4">
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
                      <span className="font-mono text-white">{row.patente || "—"}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row)}`}
                      >
                        {statusLabel(row)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {new Date(row.createdAt).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    {row.lastError ? (
                      <p className="line-clamp-2 text-xs text-zinc-400">{row.lastError}</p>
                    ) : null}
                    <motion.div className="mt-1 flex flex-wrap gap-2">
                      {canUpload ? (
                        <button
                          type="button"
                          disabled={busy || busyId != null}
                          onClick={() => void uploadOne(row.id)}
                          className="min-h-touch flex-1 rounded-xl bg-field-accent px-3 py-2 text-sm font-semibold text-field-bg disabled:opacity-50"
                        >
                          {busy ? "Subiendo…" : "Subir (1 token)"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeOne(row.id)}
                        className="min-h-touch rounded-xl border border-field-border px-3 py-2 text-sm text-zinc-400"
                      >
                        Eliminar
                      </button>
                    </motion.div>
                  </div>
                </motion.div>
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
    </motion.div>
  );
}
