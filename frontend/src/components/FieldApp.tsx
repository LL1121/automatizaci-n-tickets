"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { countInboxTickets } from "@/lib/offline-db";
import { PendingInbox } from "@/components/PendingInbox";
import { useConductorStore } from "@/store/useConductorStore";
import { useSessionStore } from "@/store/useSessionStore";
import { useVehicleStore } from "@/store/useVehicleStore";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { ConductorStep } from "@/components/ConductorStep";
import { OperatorGate } from "@/components/OperatorGate";
import { VehicleSelector } from "@/components/VehicleSelector";

type Step = "auth" | "vehicle" | "conductor" | "camera" | "feedback" | "pending";

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
  const savedLegajo = useConductorStore((s) => s.legajo);
  const savedNombre = useConductorStore((s) => s.nombre);
  const setIdentidad = useConductorStore((s) => s.setIdentidad);
  const [actividad, setActividad] = useState("");

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
      if (prev === "pending" || prev === "feedback" || prev === "camera" || prev === "conductor") {
        return prev;
      }
      if (prev === "auth" || prev === "vehicle") return "conductor";
      return prev;
    });
  }, [token, vehicleId]);

  const handleAuthDone = () => {
    setStep("vehicle");
  };

  const handleVehicleChosen = () => {
    setFeedback(null);
    setActividad("");
    setStep("conductor");
  };

  const handleConductorDone = (data: { legajo: string; nombre: string; actividad: string }) => {
    setIdentidad(data.legajo, data.nombre);
    setActividad(data.actividad);
    setStep("camera");
  };

  const handleCaptureResult = (
    result:
      | { mode: "synced" }
      | { mode: "queued"; navigatorOffline: boolean }
      | { mode: "error"; message: string; missingVehicle?: boolean },
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
      if (result.missingVehicle) clearVehicle();
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
        : step === "conductor"
          ? "conductor"
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

  const conductorMeta =
    savedLegajo.trim() && savedNombre.trim() && actividad.trim()
      ? {
          legajoConductor: savedLegajo.trim(),
          nombreConductor: savedNombre.trim(),
          tipoActividad: actividad.trim(),
        }
      : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-field-surface px-4 pb-8">
      <header className="-mx-4 mb-6 flex items-center justify-between gap-3 border-b-4 border-brand-cyan bg-brand px-4 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/irrigacion-malargue.png"
              alt="Irrigación Malargüe"
              className="h-10 w-10 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white">Fotografía</h1>
            {operatorName ? <p className="text-xs text-white/75">Operario: {operatorName}</p> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-xs">
          <span
            className={
              online
                ? "rounded-full bg-brand-cyan px-2.5 py-0.5 font-medium text-white"
                : "rounded-full bg-status-lateBg px-2.5 py-0.5 font-medium text-status-lateText"
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
                  : "text-white/80 hover:text-white"
              }`}
            >
              Pendientes{pendingCount > 0 ? `: ${pendingCount}` : ""}
            </button>
          ) : null}
        </div>
      </header>

      {toast ? (
        <div className="mb-4 rounded-xl border border-brand-cyan/30 bg-brand-light px-4 py-3 text-sm text-brand">
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
                setActividad("");
              }}
              className="btn-secondary mt-6 w-full"
            >
              Cerrar sesión
            </button>
          </div>
        ) : null}

        {step === "conductor" ? (
          <motion.div key="conductor" {...pageTransition} className="flex flex-1 flex-col">
            <ConductorStep
              legajo={savedLegajo}
              nombre={savedNombre}
              initialActividad={actividad}
              onContinue={handleConductorDone}
              onBack={() => {
                clearVehicle();
                setStep("vehicle");
              }}
            />
          </motion.div>
        ) : null}

        {step === "camera" && vehicleId != null && patente != null && conductorMeta ? (
          <motion.div key="camera" {...pageTransition} className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 flex-col gap-1 rounded-xl bg-field-surface px-4 py-2.5 text-sm ring-1 ring-field-border">
              <div className="flex items-center justify-between">
                <span className="text-field-muted">
                  Vehículo <span className="font-mono font-medium text-field-text">{patente}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearVehicle();
                    setActividad("");
                    setStep("vehicle");
                  }}
                  className="text-field-accent underline-offset-2 hover:underline"
                >
                  Cambiar
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-field-muted">
                <span>
                  {conductorMeta.nombreConductor} · Legajo {conductorMeta.legajoConductor}
                  {conductorMeta.tipoActividad ? ` · ${conductorMeta.tipoActividad}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setStep("conductor")}
                  className="text-field-accent underline-offset-2 hover:underline"
                >
                  Editar
                </button>
              </div>
            </div>
            <CameraCapture
              vehicleId={vehicleId}
              patente={patente}
              conductor={conductorMeta}
              onResult={handleCaptureResult}
            />
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
                  setActividad("");
                  setStep(vehicleId != null ? "conductor" : "vehicle");
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
              onBack={() => setStep(vehicleId != null && conductorMeta ? "camera" : vehicleId != null ? "conductor" : "vehicle")}
              onChanged={() => void refreshPending()}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
