"use client";

import { ACTIVIDAD_OPCIONES, type ConductorForm } from "@/lib/circular";
import { useState } from "react";

type Props = {
  initial?: ConductorForm;
  onContinue: (data: ConductorForm) => void;
  onBack: () => void;
};

export function ConductorStep({ initial, onContinue, onBack }: Props) {
  const [legajo, setLegajo] = useState(initial?.legajo ?? "");
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [actividad, setActividad] = useState<ConductorForm["actividad"]>(initial?.actividad ?? "");
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = legajo.trim();
    const n = nombre.trim();
    if (!l || !n || !actividad) {
      setErr("Completá legajo, apellido y nombre, y el tipo de actividad.");
      return;
    }
    setErr(null);
    onContinue({ legajo: l, nombre: n, actividad });
  };

  return (
    <form onSubmit={submit} className="card flex flex-1 flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-brand">Datos del conductor</h2>
        <p className="mt-1 text-sm text-field-muted">
          Circular 08/2026 — requerido antes de fotografiar el ticket.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-field-muted">Legajo</span>
        <input
          value={legajo}
          onChange={(e) => setLegajo(e.target.value)}
          className="input-field mt-1"
          inputMode="numeric"
          autoComplete="off"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-field-muted">Apellido y nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="input-field mt-1"
          autoComplete="name"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-field-muted">Tipo de actividad</span>
        <select
          value={actividad}
          onChange={(e) => setActividad(e.target.value as ConductorForm["actividad"])}
          className="input-field mt-1"
          required
        >
          <option value="">Seleccionar…</option>
          {ACTIVIDAD_OPCIONES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      {err ? <p className="text-sm text-field-danger">{err}</p> : null}

      <div className="mt-auto flex flex-col gap-3 pt-2">
        <button type="submit" className="btn-primary min-h-touch w-full py-4 text-base">
          Continuar a la cámara
        </button>
        <button type="button" onClick={onBack} className="btn-secondary w-full">
          Volver al vehículo
        </button>
      </div>
    </form>
  );
}
