"use client";

import { adminUploadBatch, type BatchFileResult } from "@/lib/admin-api";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LocalStatus = "queued" | "uploading" | "ok" | "partial" | "duplicate" | "error";

type LocalItem = {
  id: string;
  file: File;
  status: LocalStatus;
  tickets: number;
  duplicates: number;
  errors: string[];
  message?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const ACCEPT_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf"];

function statusLabel(s: LocalStatus): string {
  switch (s) {
    case "queued":
      return "En cola";
    case "uploading":
      return "Procesando…";
    case "ok":
      return "Éxito";
    case "partial":
      return "Parcial";
    case "duplicate":
      return "Duplicado";
    case "error":
      return "Error";
  }
}

function statusClasses(s: LocalStatus): string {
  switch (s) {
    case "ok":
      return "bg-status-verifiedBg text-status-verifiedText";
    case "partial":
      return "bg-status-pendingBg text-status-pendingText";
    case "duplicate":
      return "bg-brand-light text-brand";
    case "error":
      return "bg-status-lateBg text-status-lateText";
    case "uploading":
      return "bg-brand-light text-brand";
    default:
      return "bg-field-surface text-field-muted";
  }
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIsAccepted(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (file.type && ACCEPT.split(",").includes(file.type)) return true;
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext));
}

function mergeBatchResultIntoItem(item: LocalItem, result: BatchFileResult): LocalItem {
  return {
    ...item,
    status: result.status,
    tickets: result.tickets.length,
    duplicates: result.duplicates,
    errors: result.errors,
    message:
      result.status === "ok"
        ? `${result.tickets.length} ticket${result.tickets.length === 1 ? "" : "s"} cargado${result.tickets.length === 1 ? "" : "s"}.`
        : result.status === "partial"
          ? `${result.tickets.length} cargado/s, ${result.duplicates} duplicado/s, ${result.errors.length} error/es.`
          : result.status === "duplicate"
            ? "Ya estaba registrado."
            : result.errors[0] ?? "No se pudo procesar.",
  };
}

type Props = {
  onUploaded?: () => void;
};

export function AdminBatchUpload({ onUploaded }: Props) {
  const [items, setItems] = useState<LocalItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const totalCount = items.length;
  const doneCount = items.filter((i) => i.status !== "queued" && i.status !== "uploading").length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: LocalItem[] = [];
    for (const f of Array.from(files)) {
      if (!fileIsAccepted(f)) continue;
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "queued",
        tickets: 0,
        duplicates: 0,
        errors: [],
      });
    }
    if (accepted.length === 0) return;
    setItems((prev) => [...prev, ...accepted]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "queued" || i.status === "uploading"));
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processAll = async () => {
    if (running) return;
    const queue = items.filter((i) => i.status === "queued");
    if (queue.length === 0) return;
    setRunning(true);
    let touched = false;
    try {
      for (const item of queue) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));
        try {
          const r = await adminUploadBatch([item.file]);
          const fileResult = r.results[0];
          if (!fileResult) {
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: "error", errors: ["Sin respuesta del servidor."] }
                  : i,
              ),
            );
          } else {
            if (fileResult.tickets.length > 0) touched = true;
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? mergeBatchResultIntoItem(i, fileResult) : i)),
            );
          }
        } catch (e) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "error",
                    errors: [e instanceof Error ? e.message : "Error de red."],
                  }
                : i,
            ),
          );
        }
      }
    } finally {
      setRunning(false);
      if (touched) onUploaded?.();
    }
  };

  const hasQueued = useMemo(() => items.some((i) => i.status === "queued"), [items]);

  useEffect(() => {
    return () => {
      dragCounter.current = 0;
    };
  }, []);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-field-border bg-field-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-brand">Carga masiva de tickets</h2>
          <p className="text-sm text-field-muted">
            Arrastrá imágenes o PDFs (admite hojas A4 con varios tickets pegados). La IA segmenta y registra cada uno.
          </p>
        </div>
        {items.length > 0 ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-light px-2 py-1 font-medium text-brand">
              {doneCount}/{totalCount} procesados
            </span>
            {!running && items.some((i) => i.status !== "queued") ? (
              <button type="button" onClick={clearDone} className="text-field-muted hover:text-field-accent">
                Limpiar terminados
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <motion.div
          onDrop={onDrop}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          animate={{
            scale: dragActive ? 1.015 : 1,
            borderColor: dragActive ? "#0099D8" : "#E2E8F0",
            backgroundColor: dragActive ? "#EAF4FB" : "#FFFFFF",
          }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-cyan/50 bg-white px-6 py-10 text-center transition hover:border-brand-cyan"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-field-text">
              Arrastrá los archivos o <span className="text-field-accent underline">seleccioná desde el equipo</span>
            </p>
            <p className="mt-1 text-xs text-field-muted">
              Imágenes (.jpg, .png, .webp) o PDF. Soporta múltiples archivos y hojas A4 con varios tickets pegados.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={onPickFiles}
            className="hidden"
          />
        </motion.div>

        {items.length > 0 ? (
          <div className="space-y-3">
            {running || totalCount > 1 ? (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-field-muted">
                  <span>{running ? "Procesando lote…" : "Lote completado"}</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-field-surface">
                  <motion.div
                    className="h-full bg-brand"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  />
                </div>
              </div>
            ) : null}

            <ul className="divide-y divide-field-border rounded-xl border border-field-border bg-white">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v12a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-field-text">{item.file.name}</p>
                      <p className="text-xs text-field-muted">
                        {fileSizeLabel(item.file.size)}
                        {item.message ? ` · ${item.message}` : null}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(item.status)}`}
                    >
                      {item.status === "uploading" ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : null}
                      {statusLabel(item.status)}
                    </span>
                    {item.status === "queued" || item.status === "error" || item.status === "duplicate" ? (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="ml-1 text-xs text-field-muted hover:text-field-danger"
                        aria-label={`Quitar ${item.file.name}`}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setItems([])}
              disabled={running}
              className="btn-secondary !min-h-0 px-4 py-2 text-sm disabled:opacity-50"
            >
              Vaciar lista
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void processAll()}
            disabled={!hasQueued || running}
            className="btn-primary min-h-11 px-6 disabled:opacity-50"
          >
            {running ? "Procesando…" : hasQueued ? `Procesar ${items.filter((i) => i.status === "queued").length}` : "Procesar"}
          </button>
        </div>
      </div>
    </section>
  );
}
