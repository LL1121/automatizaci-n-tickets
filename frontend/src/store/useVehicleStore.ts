"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type VehicleState = {
  vehicleId: number | null;
  patente: string | null;
  unidadMedida: "KM" | "HORAS" | null;
  setVehicle: (id: number, patente: string, unidadMedida?: string | null) => void;
  clearVehicle: () => void;
};

export const useVehicleStore = create<VehicleState>()(
  persist(
    (set) => ({
      vehicleId: null,
      patente: null,
      unidadMedida: null,
      setVehicle: (vehicleId, patente, unidadMedida) =>
        set({
          vehicleId,
          patente,
          unidadMedida: unidadMedida === "HORAS" ? "HORAS" : "KM",
        }),
      clearVehicle: () => set({ vehicleId: null, patente: null, unidadMedida: null }),
    }),
    { name: "fuelops-vehicle" },
  ),
);
