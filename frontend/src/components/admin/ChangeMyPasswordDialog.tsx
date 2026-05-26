"use client";

import { ModalBackdrop } from "@/components/ui/ModalBackdrop";
import { changeMyPassword } from "@/lib/admin-api";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChangeMyPasswordDialog({ open, onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setRepeat("");
      setMsg(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!current || !next || !repeat) {
      setMsg({ type: "error", text: "Completá todos los campos." });
      return;
    }
    if (next.length < 8) {
      setMsg({ type: "error", text: "La nueva contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (next !== repeat) {
      setMsg({ type: "error", text: "La confirmación no coincide." });
      return;
    }
    if (next === current) {
      setMsg({ type: "error", text: "La nueva contraseña debe ser distinta a la actual." });
      return;
    }
    setSubmitting(true);
    try {
      await changeMyPassword(current, next);
      setMsg({ type: "ok", text: "Contraseña actualizada." });
      setCurrent("");
      setNext("");
      setRepeat("");
      window.setTimeout(() => onClose(), 1100);
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <ModalBackdrop open={open} onClose={onClose} zIndex={80} />
      <div
        className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal
        aria-labelledby="cmp-title"
      >
        <form
          onSubmit={submit}
          className="card pointer-events-auto w-full max-w-md p-6 shadow-lg"
        >
          <h2 id="cmp-title" className="text-lg font-semibold text-field-text">
            Cambiar contraseña
          </h2>
          <p className="mt-1 text-sm text-field-muted">
            Por seguridad, ingresá tu contraseña actual antes de definir una nueva.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <label className="block text-sm">
              <span className="text-field-muted">Contraseña actual</span>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
            <label className="block text-sm">
              <span className="text-field-muted">Nueva contraseña</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
            <label className="block text-sm">
              <span className="text-field-muted">Repetir nueva contraseña</span>
              <input
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
          </div>

          {msg ? (
            <p
              role={msg.type === "error" ? "alert" : "status"}
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                msg.type === "error"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-status-verifiedBg bg-status-verifiedBg text-status-verifiedText"
              }`}
            >
              {msg.text}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary sm:min-w-[6rem]"
            >
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary sm:min-w-[8rem]">
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
