"use client";

import { persistAndTryUpload } from "@/lib/sync-queue";
import { UploadHttpError } from "@/lib/upload-ticket";
import gsap from "gsap";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Props = {
  vehicleId: number;
  patente: string;
  onResult: (
    r:
      | { mode: "synced" }
      | { mode: "queued"; navigatorOffline: boolean }
      | { mode: "error"; message: string },
  ) => void;
};

export function CameraCapture({ vehicleId, patente, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanHostRef = useRef<HTMLDivElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
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
  }, [stopStream]);

  useLayoutEffect(() => {
    void startCamera();
    return () => stopStream();
  }, [startCamera, stopStream]);

  useLayoutEffect(() => {
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
  }, []);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `ticket-${patente}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92,
      );
    });
  }, [patente]);

  const shutter = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(50);
      }
      const file = await captureFrame();
      if (!file) {
        setError("No se pudo capturar la imagen.");
        setBusy(false);
        return;
      }
      const outcome = await persistAndTryUpload(file, vehicleId, patente);
      if (outcome.mode === "synced") {
        onResult({ mode: "synced" });
      } else {
        onResult({ mode: "queued", navigatorOffline: outcome.navigatorOffline });
      }
    } catch (e) {
      if (e instanceof UploadHttpError) {
        onResult({
          mode: "error",
          message: `${e.message}\n${e.body}`,
        });
      } else {
        onResult({ mode: "error", message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-field-border">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="relative h-[72%] w-[88%] max-w-md">
            <div className="absolute inset-0 rounded-2xl border-2 border-white/35 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.15)]" />
            <div ref={scanHostRef} className="absolute inset-[10%] overflow-hidden rounded-xl">
              <div
                ref={scanLineRef}
                className="absolute left-0 right-0 top-0 h-[3px] rounded-full bg-field-accent shadow-[0_0_16px_#22d3ee,0_0_32px_rgba(34,211,238,0.35)]"
              />
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-center text-sm text-field-danger">{error}</p> : null}

      <button
        type="button"
        disabled={busy || Boolean(error)}
        onClick={() => void shutter()}
        className="min-h-touch w-full rounded-2xl bg-field-accent py-4 text-base font-semibold text-field-bg shadow-lg shadow-field-accent/25 disabled:opacity-50"
      >
        {busy ? "Procesando…" : "Capturar ticket"}
      </button>

      <button
        type="button"
        onClick={() => void startCamera()}
        className="min-h-touch w-full rounded-xl border border-field-border py-3 text-sm text-zinc-400"
      >
        Reiniciar cámara
      </button>
    </div>
  );
}
