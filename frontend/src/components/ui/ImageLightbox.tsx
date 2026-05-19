"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  src: string;
  alt: string;
  title?: string;
  onClose: () => void;
  zIndex?: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function touchDistance(touches: { length: number; 0?: Touch; 1?: Touch }) {
  if (touches.length < 2 || !touches[0] || !touches[1]) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function ImageLightbox({ open, src, alt, title, onClose, zIndex = 70 }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setPos({ x: 0, y: 0 });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next <= 1) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.2 : 0.2);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: touchDistance(e.touches), scale };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const dist = touchDistance(e.touches);
    if (dist <= 0) return;
    const ratio = dist / pinchRef.current.dist;
    const next = clampScale(pinchRef.current.scale * ratio);
    setScale(next);
    if (next <= 1) setPos({ x: 0, y: 0 });
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  if (!open || typeof document === "undefined") return null;

  const pct = Math.round(scale * 100);

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black text-white"
      style={{ zIndex }}
      role="dialog"
      aria-modal
      aria-label={title ?? alt}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 safe-pt">
        <p className="truncate text-sm text-zinc-300">{title ?? alt} · {pct}%</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomBy(-0.35)}
            disabled={scale <= MIN_SCALE}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-lg disabled:opacity-40"
            aria-label="Alejar"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium"
          >
            {pct}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.35)}
            disabled={scale >= MAX_SCALE}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-lg disabled:opacity-40"
            aria-label="Acercar"
          >
            +
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => {
          if (scale > 1) resetView();
          else setScale(2);
        }}
      >
        <div className="flex h-full w-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-75 will-change-transform"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            }}
          />
        </div>
      </div>
      <p className="shrink-0 pb-3 text-center text-xs text-zinc-500 safe-pb">
        Rueda o pellizco para zoom · arrastrá para mover · doble clic para alternar
      </p>
    </div>,
    document.body,
  );
}
