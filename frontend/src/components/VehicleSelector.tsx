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
        <h2 className="text-2xl font-semibold text-white">Elegí el vehículo</h2>
        <p className="mt-2 text-sm text-zinc-400">Patente y tanque según base Fuel-Ops.</p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : err ? (
        <div className="rounded-xl border border-field-border bg-field-surface p-4 text-sm text-rose-300">
          {err}
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 min-h-touch w-full rounded-xl border border-field-border py-3 text-field-accent"
          >
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay vehículos cargados en el servidor.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((v) => (
            <li key={v.id}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => pick(v)}
                className="flex min-h-touch w-full items-center justify-between rounded-2xl border border-field-border bg-field-surface px-5 py-4 text-left ring-field-accent/0 transition hover:border-field-accent/50 hover:ring-2"
              >
                <span className="font-mono text-lg text-white">{v.patente}</span>
                {v.capacidad_tanque != null ? (
                  <span className="text-sm text-zinc-500">{v.capacidad_tanque} L</span>
                ) : (
                  <span className="text-sm text-zinc-600">—</span>
                )}
              </motion.button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
