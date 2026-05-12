"use client";

import { useSessionStore } from "@/store/useSessionStore";
import { motion } from "framer-motion";
import { useState } from "react";

type Props = {
  onSuccess: () => void;
};

export function MockAuthGate({ onSuccess }: Props) {
  const setSession = useSessionStore((s) => s.setSession);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Ingresá al menos 2 caracteres.");
      return;
    }
    setError(null);
    setSession(trimmed);
    onSuccess();
  };

  return (
    <motion.form
      onSubmit={submit}
      className="flex flex-1 flex-col justify-center gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Identificáte</h2>
        <p className="mt-2 text-sm text-zinc-400">Sesión simulada: queda guardada en este dispositivo.</p>
      </div>
      <div>
        <label htmlFor="op" className="mb-2 block text-sm text-zinc-400">
          Nombre del operario
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
        Ingresar
      </button>
    </motion.form>
  );
}
