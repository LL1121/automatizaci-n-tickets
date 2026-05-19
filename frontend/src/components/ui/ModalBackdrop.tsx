"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose?: () => void;
  zIndex?: number;
  blur?: boolean;
  children?: ReactNode;
  className?: string;
};

/** Capa de overlay a pantalla completa (portal en body) para evitar fallos de blur en contenedores con scroll. */
export function ModalBackdrop({ open, onClose, zIndex = 50, blur = true, children, className = "" }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 isolate ${className}`} style={{ zIndex }} role="presentation">
      <button
        type="button"
        className={`absolute inset-0 h-full w-full cursor-default border-0 p-0 ${
          blur ? "bg-slate-900/45 backdrop-blur-md" : "bg-black/90"
        }`}
        aria-label="Cerrar"
        onClick={onClose}
      />
      {children ? <div className="pointer-events-none absolute inset-0">{children}</div> : null}
    </div>,
    document.body,
  );
}
