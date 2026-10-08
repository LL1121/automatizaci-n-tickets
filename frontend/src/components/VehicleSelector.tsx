"use client";

import { getApiBase } from "@/lib/api";
import { etiquetaTipoVehiculo } from "@/lib/circular";
import { useVehicleStore } from "@/store/useVehicleStore";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

export type VehicleDTO = {
  id: number;
  patente: string;
  capacidad_tanque: number | null;
  tipo: string | null;
  modelo: string | null;
};

type Grupo = "vehiculos" | "maquinas";

type Props = {
  onSelected: () => void;
};

export function VehicleSelector({ onSelected }: Props) {
  const setVehicle = useVehicleStore((s) => s.setVehicle);
  const [items, setItems] = useState<VehicleDTO[]>([]);
  const [grupo, setGrupo] = useState<Grupo>("vehiculos");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${getApiBase()}/vehicles`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VehicleDTO[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErr("No se pudo cargar la flota. Revisá la conexión o la URL del API.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const vehiculos = useMemo(() => items.filter((v) => v.tipo !== "maquinaria"), [items]);
  const maquinas = useMemo(() => items.filter((v) => v.tipo === "maquinaria"), [items]);
  const visibles = grupo === "maquinas" ? maquinas : vehiculos;

  const pick = (v: VehicleDTO) => {
    setVehicle(v.id, v.patente);
    onSelected();
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-brand">Elegí el vehículo</h2>
        <p className="mt-2 text-sm text-field-muted">Patente y tipo, separados en vehículos y máquinas.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setGrupo("vehiculos")}
          className={
            grupo === "vehiculos"
              ? "btn-primary !min-h-0 py-2 text-sm"
              : "btn-secondary !min-h-0 py-2 text-sm"
          }
        >
          Vehículos
        </button>
        <button
          type="button"
          onClick={() => setGrupo("maquinas")}
          className={
            grupo === "maquinas"
              ? "btn-primary !min-h-0 py-2 text-sm"
              : "btn-secondary !min-h-0 py-2 text-sm"
          }
        >
          Máquinas
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-field-muted">Cargando…</p>
      ) : err ? (
        <div className="card p-4 text-sm text-field-danger">
          {err}
          <button type="button" onClick={() => void load()} className="btn-secondary mt-4 w-full">
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-field-muted">No hay vehículos cargados en el servidor.</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-field-muted">
          {grupo === "maquinas"
            ? "No hay máquinas. Cargalas en Auditoría con tipo Maquinaria."
            : "No hay vehículos en este grupo."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((v) => {
            const tipo = etiquetaTipoVehiculo(v.tipo, v.modelo);
            return (
              <li key={v.id}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => pick(v)}
                  className="card flex min-h-touch w-full items-center justify-between px-5 py-4 text-left transition hover:border-brand-cyan/60 hover:shadow-md"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-lg text-field-text">{v.patente}</span>
                    <span className="mt-0.5 block text-sm text-field-muted">{tipo || "Sin tipo"}</span>
                  </span>
                </motion.button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
