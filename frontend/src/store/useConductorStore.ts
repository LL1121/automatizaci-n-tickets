"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ConductorState = {
  legajo: string;
  nombre: string;
  setIdentidad: (legajo: string, nombre: string) => void;
  hasIdentidad: () => boolean;
};

/** Legajo y nombre quedan en el celular. La actividad se carga en cada ticket. */
export const useConductorStore = create<ConductorState>()(
  persist(
    (set, get) => ({
      legajo: "",
      nombre: "",
      setIdentidad: (legajo, nombre) => set({ legajo: legajo.trim(), nombre: nombre.trim() }),
      hasIdentidad: () => Boolean(get().legajo.trim() && get().nombre.trim()),
    }),
    { name: "fuelops-conductor" },
  ),
);
