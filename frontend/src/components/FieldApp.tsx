"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { countInboxTickets } from "@/lib/offline-db";
import { PendingInbox } from "@/components/PendingInbox";
import { useSessionStore } from "@/store/useSessionStore";
import { useVehicleStore } from "@/store/useVehicleStore";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { OperatorGate } from "@/components/OperatorGate";
import { VehicleSelector } from "@/components/VehicleSelector";

type Step = "auth" | "vehicle" | "camera" | "feedback" | "pending";

type FeedbackState =
  | { step: "feedback"; variant: "synced" }
  | { step: "feedback"; variant: "offline"; navigatorOffline: boolean }
  | { step: "feedback"; variant: "error"; message: string };

const pageTransition = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

export function FieldApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const token = useSessionStore((s) => s.token);
  const operatorName = useSessionStore((s) => s.operatorName);
  const vehicleId = useVehicleStore((s) => s.vehicleId);
  const patente = useVehicleStore((s) => s.patente);
  const clearVehicle = useVehicleStore((s) => s.clearVehicle);
  const logout = useSessionStore((s) => s.logout);

  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>("auth");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    try {
      const n = await countInboxTickets();
      setPendingCount(n);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending, step, feedback]);

  const onFlush = useCallback(
    async (result: { uploaded: number; failed: number; errors: string[] }) => {
      await refreshPending();
      if (result.uploaded > 0) {
        setToast(`Sincronizados: ${result.uploaded} ticket(s)`);
        window.setTimeout(() => setToast(null), 4000);
      }
    },
    [refreshPending],
  );

  useOfflineSync(onFlush);

  useEffect(() => {
    if (!token) {
      setStep("auth");
      return;
    }
    if (vehicleId == null) {
      setStep((prev) => (prev === "pending" ? "pending" : "vehicle"));
      return;
    }
    setStep((prev) => {
      if (prev === "pending" || prev === "feedback" || prev === "camera") return prev;
      if (prev === "auth" || prev === "vehicle") return "camera";
      return prev;
    });
  }, [token, vehicleId]);

  const handleAuthDone = () => {
    setStep("vehicle");
  };

  const handleVehicleChosen = () => {
    setFeedback(null);
    setStep("camera");
  };

  const handleCaptureResult = (
    result:
      | { mode: "synced" }
      | { mode: "queued"; navigatorOffline: boolean }
      | { mode: "error"; message: string },
  ) => {
    if (result.mode === "synced") {
      setFeedback({ step: "feedback", variant: "synced" });
    } else if (result.mode === "queued") {
      setFeedback({
        step: "feedback",
        variant: "offline",
        navigatorOffline: result.navigatorOffline,
      });
    } else {
      setFeedback({ step: "feedback", variant: "error", message: result.message });
    }
    setStep("feedback");
    void refreshPending();
  };

  const screenKey =
    step === "auth"
      ? "auth"
      : step === "vehicle"
        ? "vehicle"
        : step === "camera"
          ? "camera"
          : step === "pending"
            ? "pending"
            : feedback
              ? `feedback-${feedback.variant}`
              : "feedback";

  if (!mounted) {
    return <div className="min-h-dvh bg-field-bg" aria-busy="true" />;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-8 pt-4">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/irrigacion-malargue.png"
            alt="Irrigación Malargüe"
            className="h-12 w-12 shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-field-text">Fotografía</h1>
            {operatorName ? <p className="text-xs text-field-muted">Operario: {operatorName}</p> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-xs text-field-muted">
          <span
            className={
              online ? "rounded-full bg-status-verifiedBg px-2 py-0.5 text-status-verifiedText" : "rounded-full bg-red-100 px-2 py-0.5 text-red-700"
            }
          >
            {online ? "En línea" : "Sin conexión"}
          </span>
          {token ? (
            <button
              type="button"
              onClick={() => setStep("pending")}
              className={`rounded-full px-2 py-0.5 font-medium ${
                pendingCount > 0
                  ? "bg-status-pendingBg text-status-pendingText"
                  : "text-field-muted hover:text-field-accent"
              }`}
            >
              Pendientes{pendingCount > 0 ? `: ${pendingCount}` : ""}
            </button>
          ) : null}
        </div>
      </header>

      {toast ? (
        <div className="mb-4 rounded-xl border border-brand/20 bg-brand-light px-4 py-3 text-sm text-brand">
          {toast}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {step === "auth" ? (
          <div key="auth" {...pageTransition} className="flex flex-1 flex-col">
            <OperatorGate onSuccess={handleAuthDone} />
          </div>
        ) : null}

        {step === "vehicle" ? (
          <div key="vehicle" {...pageTransition} className="flex flex-1 flex-col">
            <VehicleSelector onSelected={handleVehicleChosen} />
            <button
              type="button"
              onClick={() => {
                logout();
                clearVehicle();
              }}
              className="btn-secondary mt-6 w-full"
            >
              Cerrar sesión
            </button>
          </div>
        ) : null}

        {step === "camera" && vehicleId != null && patente != null ? (
          <motion.div key="camera" {...pageTransition} className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between rounded-xl bg-field-surface px-4 py-2.5 text-sm ring-1 ring-field-border">
              <span className="text-field-muted">
                Vehículo <span className="font-mono font-medium text-field-text">{patente}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  clearVehicle();
                  setStep("vehicle");
                }}
                className="text-field-accent underline-offset-2 hover:underline"
              >
                Cambiar
              </button>
            </div>
            <CameraCapture vehicleId={vehicleId} patente={patente} onResult={handleCaptureResult} />
          </motion.div>
        ) : null}

        {step === "feedback" && feedback ? (
          <div key={screenKey} {...pageTransition} className="flex flex-1 flex-col justify-center gap-6">
            {feedback.variant === "synced" ? (
              <div className="card p-6 text-center">
                <p className="text-sm font-medium text-status-verifiedText">Ticket registrado</p>
                <p className="mt-2 text-sm text-field-muted">El servidor procesó y guardó el comprobante.</p>
              </div>
            ) : null}
            {feedback.variant === "offline" ? (
              <div className="card border-status-pendingBg bg-status-pendingBg p-6 text-center">
                <p className="text-sm font-medium text-status-pendingText">Guardado en este dispositivo</p>
                <p className="mt-2 text-sm text-field-muted">
                  {feedback.navigatorOffline
                    ? "No hay red ahora. Entrá a Pendientes y subí la foto cuando tengas conexión (una por vez)."
                    : "Quedó guardado en Pendientes. Subilo manualmente desde ahí cuando quieras enviarlo al servidor."}
                </p>
              </div>
            ) : null}
            {feedback.variant === "error" ? (
              <div className="card border-red-200 bg-red-50 p-6 text-center">
                <p className="text-sm font-medium text-red-800">No se pudo registrar</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-field-muted">{feedback.message}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setStep("pending");
                }}
                className="min-h-touch w-full rounded-2xl border border-field-border py-4 text-base font-semibold text-field-accent"
              >
                Ver pendientes
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setStep("camera");
                }}
                className="btn-primary min-h-touch w-full py-4 text-base"
              >
                Otra captura
              </button>
            </div>
          </div>
        ) : null}

        {step === "pending" ? (
          <div key="pending" {...pageTransition} className="flex flex-1 flex-col">
            <PendingInbox
              onBack={() => setStep(vehicleId != null ? "camera" : "vehicle")}
              onChanged={() => void refreshPending()}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
