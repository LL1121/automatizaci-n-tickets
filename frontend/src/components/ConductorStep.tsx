"use client";

import { useEffect, useState } from "react";

type Props = {
  legajo: string;
  nombre: string;
  initialActividad?: string;
  onContinue: (data: { legajo: string; nombre: string; actividad: string }) => void;
  onBack: () => void;
};

export function ConductorStep({
  legajo: savedLegajo,
  nombre: savedNombre,
  initialActividad = "",
  onContinue,
  onBack,
}: Props) {
  const saved = Boolean(savedLegajo.trim() && savedNombre.trim());
  const [editing, setEditing] = useState(!saved);
  const [legajo, setLegajo] = useState(savedLegajo);
  const [nombre, setNombre] = useState(savedNombre);
  const [actividad, setActividad] = useState(initialActividad);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (savedLegajo.trim() && savedNombre.trim()) {
      setLegajo(savedLegajo);
      setNombre(savedNombre);
      setEditing(false);
    }
  }, [savedLegajo, savedNombre]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = (editing ? legajo : savedLegajo).trim();
    const n = (editing ? nombre : savedNombre).trim();
    const a = actividad.trim();
    if (!l || !n || !a) {
      setErr("Completá legajo, apellido y nombre, y el tipo de actividad.");
      return;
    }
    setErr(null);
    onContinue({ legajo: l, nombre: n, actividad: a });
  };

  return (
    <form onSubmit={submit} className="card flex flex-1 flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-brand">Datos de la carga</h2>
        <p className="mt-1 text-sm text-field-muted">
          El legajo queda guardado en este celular. La actividad se carga en cada ticket.
        </p>
      </div>

      {saved && !editing ? (
        <div className="rounded-xl bg-field-surface px-4 py-3 text-sm ring-1 ring-field-border">
          <p className="font-medium text-field-text">{savedNombre}</p>
          <p className="text-field-muted">Legajo {savedLegajo}</p>
          <button
            type="button"
            className="mt-2 text-field-accent underline-offset-2 hover:underline"
            onClick={() => {
              setLegajo(savedLegajo);
              setNombre(savedNombre);
              setEditing(true);
            }}
          >
            Cambiar conductor
          </button>
        </div>
      ) : (
        <>
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
        </>
      )}

      <label className="block text-sm">
        <span className="text-field-muted">Tipo de actividad</span>
        <input
          value={actividad}
          onChange={(e) => setActividad(e.target.value)}
          className="input-field mt-1"
          placeholder="Ej. Recorrido de canales"
          maxLength={160}
          required
        />
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
