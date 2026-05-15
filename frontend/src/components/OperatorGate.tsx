"use client";

import { getOrCreateDeviceUid } from "@/lib/device-id";
import { useSessionStore } from "@/store/useSessionStore";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  onSuccess: () => void;
};

export function OperatorGate({ onSuccess }: Props) {
  const bootstrapFromServer = useSessionStore((s) => s.bootstrapFromServer);
  const registerOperator = useSessionStore((s) => s.registerOperator);
  const bootstrapping = useSessionStore((s) => s.bootstrapping);
  const operatorName = useSessionStore((s) => s.operatorName);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setChecking(true);
      const ok = await bootstrapFromServer();
      if (cancelled) return;
      setChecking(false);
      if (ok && useSessionStore.getState().operatorName) {
        onSuccess();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapFromServer, onSuccess]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Ingresá al menos 2 caracteres.");
      return;
    }
    setError(null);
    try {
      await registerOperator(trimmed);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el operario.");
    }
  };

  if (checking || bootstrapping) {
    return (
      <motion.div
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-sm text-zinc-400">Identificando dispositivo…</p>
        {operatorName ? <p className="font-medium text-white">{operatorName}</p> : null}
      </motion.div>
    );
  }

  const deviceHint = getOrCreateDeviceUid().slice(0, 8);

  return (
    <motion.form
      onSubmit={(e) => void submit(e)}
      className="flex flex-1 flex-col justify-center gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Bienvenido</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Este celular quedará vinculado a tu nombre. ID dispositivo: <span className="font-mono text-zinc-300">{deviceHint}…</span>
        </p>
      </div>
      <div>
        <label htmlFor="op" className="mb-2 block text-sm text-zinc-400">
          Tu nombre
        </label>
        <input
          id="op"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="min-h-touch w-full rounded-xl border border-field-border bg-field-surface px-4 text-base text-white outline-none ring-field-accent/40 placeholder:text-zinc-600 focus:ring-2"
          placeholder="Ej. Lautaro"
        />
        {error ? <p className="mt-2 text-sm text-field-danger">{error}</p> : null}
      </div>
      <button
        type="submit"
        className="min-h-touch w-full rounded-2xl bg-field-accent py-4 text-base font-semibold text-field-bg shadow-lg shadow-field-accent/20"
      >
        Continuar
      </button>
    </motion.form>
  );
}
