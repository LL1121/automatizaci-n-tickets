"use client";

import { guideCropOnVideo } from "@/lib/camera-crop";
import { persistAndTryUpload } from "@/lib/sync-queue";
import {
  humanizeUploadDetail,
  isMissingVehicleDetail,
  UploadHttpError,
  type UploadConductorMeta,
} from "@/lib/upload-ticket";
import gsap from "gsap";
import { motion } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Marco de guía como fracción del visor (ticket alto y angosto). */
const GUIDE_WIDTH_RATIO = 0.46;
const GUIDE_HEIGHT_RATIO = 0.84;

type Props = {
  vehicleId: number;
  patente: string;
  conductor: UploadConductorMeta;
  onResult: (
    r:
      | { mode: "synced" }
      | { mode: "queued"; navigatorOffline: boolean }
      | { mode: "error"; message: string; missingVehicle?: boolean },
  ) => void;
};

export function CameraCapture({ vehicleId, patente, conductor, onResult }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanHostRef = useRef<HTMLDivElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearFreeze = useCallback(() => {
    setFrozenUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    const v = videoRef.current;
    if (v && v.srcObject) {
      void v.play().catch(() => undefined);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    clearFreeze();
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
    } catch {
      setError("No se pudo acceder a la cámara. Revisá permisos del navegador.");
    }
  }, [stopStream, clearFreeze]);

  useLayoutEffect(() => {
    void startCamera();
    return () => {
      stopStream();
      clearFreeze();
    };
  }, [startCamera, stopStream, clearFreeze]);

  useLayoutEffect(() => {
    if (frozenUrl) return;
    const line = scanLineRef.current;
    const host = scanHostRef.current;
    if (!line || !host) return;

    const run = () => {
      const h = host.clientHeight;
      gsap.killTweensOf(line);
      gsap.set(line, { y: 0 });
      gsap.to(line, {
        y: Math.max(0, h - 3),
        duration: 1.55,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(host);
    return () => {
      ro.disconnect();
      gsap.killTweensOf(line);
    };
  }, [frozenUrl]);

  const freezeAndCapture = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || video.videoWidth === 0) return null;

    video.pause();

    const { width: cw, height: ch } = container.getBoundingClientRect();
    const crop = guideCropOnVideo(
      cw,
      ch,
      video.videoWidth,
      video.videoHeight,
      GUIDE_WIDTH_RATIO,
      GUIDE_HEIGHT_RATIO,
    );

    const canvas = document.createElement("canvas");
    canvas.width = crop.sw;
    canvas.height = crop.sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

    const file = await new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `ticket-${patente}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.86,
      );
    });

    if (!file) return null;

    const url = URL.createObjectURL(file);
    setFrozenUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    if (scanLineRef.current) {
      gsap.killTweensOf(scanLineRef.current);
    }

    return file;
  }, [patente]);

  const shutter = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(50);
      }
      const file = await freezeAndCapture();
      if (!file) {
        setError("No se pudo capturar la imagen.");
        clearFreeze();
        setBusy(false);
        return;
      }
      const outcome = await persistAndTryUpload(file, vehicleId, patente, conductor);
      if (outcome.mode === "synced") {
        onResult({ mode: "synced" });
      } else {
        onResult({ mode: "queued", navigatorOffline: outcome.navigatorOffline });
      }
    } catch (e) {
      clearFreeze();
      if (e instanceof UploadHttpError) {
        let detail = e.body;
        try {
          const parsed = JSON.parse(e.body) as { detail?: string };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          /* body plano */
        }
        const raw = detail || e.message;
        onResult({
          mode: "error",
          message: humanizeUploadDetail(raw, patente),
          missingVehicle: isMissingVehicleDetail(raw),
        });
      } else {
        const raw = e instanceof Error ? e.message : String(e);
        onResult({
          mode: "error",
          message: humanizeUploadDetail(raw, patente),
          missingVehicle: isMissingVehicleDetail(raw),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const isFrozen = frozenUrl != null;

  const guideInsetX = `${((1 - GUIDE_WIDTH_RATIO) / 2) * 100}%`;
  const guideInsetY = `${((1 - GUIDE_HEIGHT_RATIO) / 2) * 100}%`;

  return (
    <motion.div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        className="relative min-h-[min(72dvh,680px)] w-full flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-field-border aspect-[3/4]"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            isFrozen ? "opacity-0" : "opacity-100"
          }`}
        />

        {frozenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frozenUrl}
            alt="Captura del ticket"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}

        {isFrozen ? (
          <div className="pointer-events-none absolute inset-0 bg-black/20" aria-hidden />
        ) : null}

        <div
          className="pointer-events-none absolute"
          style={{
            top: guideInsetY,
            left: guideInsetX,
            right: guideInsetX,
            bottom: guideInsetY,
          }}
        >
          <div className="relative h-full w-full">
            <div className="absolute inset-0 rounded-xl border-2 border-brand-cyan shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            <div ref={scanHostRef} className="absolute inset-[8%] overflow-hidden rounded-lg">
              {!isFrozen ? (
                <div
                  ref={scanLineRef}
                  className="absolute left-0 right-0 top-0 h-[3px] rounded-full bg-brand-cyan shadow-[0_0_16px_#0099D8,0_0_32px_rgba(0,153,216,0.35)]"
                />
              ) : null}
            </div>
          </div>
        </div>

        {isFrozen && busy ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-4 pb-6 pt-4">
            <p className="text-center text-sm font-medium text-brand-light">Procesando captura…</p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void startCamera()}
          className="absolute left-3 top-3 z-20 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm disabled:opacity-50"
        >
          Reiniciar
        </button>

        {error ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
            <p className="max-w-sm rounded-lg bg-status-lateBg px-4 py-2 text-center text-xs font-medium text-status-lateText shadow-lg">
              {error}
            </p>
          </div>
        ) : null}
      </div>

      {!error ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void shutter()}
          aria-label={busy ? "Procesando captura" : "Capturar ticket"}
          className="btn-capture mt-3 disabled:opacity-50"
        >
          {busy ? "Procesando…" : "Capturar ticket"}
        </button>
      ) : null}
    </motion.div>
  );
}
