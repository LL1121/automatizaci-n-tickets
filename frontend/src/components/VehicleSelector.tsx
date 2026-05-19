"use client";

import { getApiBase } from "@/lib/api";
import { useVehicleStore } from "@/store/useVehicleStore";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

export type VehicleDTO = {
  id: number;
  patente: string;
  capacidad_tanque: number | null;
};

type Props = {
  onSelected: () => void;
};

export function VehicleSelector({ onSelected }: Props) {
  const setVehicle = useVehicleStore((s) => s.setVehicle);
  const [items, setItems] = useState<VehicleDTO[]>([]);
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

  const pick = (v: VehicleDTO) => {
    setVehicle(v.id, v.patente);
    onSelected();
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-brand">Elegí el vehículo</h2>
        <p className="mt-2 text-sm text-field-muted">Patente y tanque según base Fuel-Ops.</p>
      </div>

      {loading ? (
        <p className="text-sm text-field-muted">Cargando…</p>
      ) : err ? (
        <div className="card p-4 text-sm text-field-danger">
          {err}
          <button
            type="button"
            onClick={() => void load()}
            className="btn-secondary mt-4 w-full"
          >
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-field-muted">No hay vehículos cargados en el servidor.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((v) => (
            <li key={v.id}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => pick(v)}
                className="card flex min-h-touch w-full items-center justify-between px-5 py-4 text-left transition hover:border-brand/40 hover:shadow-md"
              >
                <span className="font-mono text-lg text-field-text">{v.patente}</span>
                {v.capacidad_tanque != null ? (
                  <span className="text-sm text-field-muted">{v.capacidad_tanque} L</span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </motion.button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
