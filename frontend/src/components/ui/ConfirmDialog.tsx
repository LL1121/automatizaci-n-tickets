"use client";

import { createPortal } from "react-dom";
import { ModalBackdrop } from "@/components/ui/ModalBackdrop";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "primary",
  onConfirm,
  onCancel,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  const confirmClass =
    variant === "danger"
      ? "btn-primary !bg-field-danger hover:!bg-red-700"
      : "btn-primary";

  return createPortal(
    <>
      <ModalBackdrop open={open} onClose={onCancel} zIndex={80} />
      <div
        className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
        role="alertdialog"
        aria-modal
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
      >
        <div className="card pointer-events-auto w-full max-w-md p-6 shadow-lg">
          <h2 id="confirm-title" className="text-lg font-semibold text-field-text">
            {title}
          </h2>
          <p id="confirm-desc" className="mt-2 text-sm text-field-muted">
            {message}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary sm:min-w-[7rem]">
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} className={`${confirmClass} sm:min-w-[7rem]`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
