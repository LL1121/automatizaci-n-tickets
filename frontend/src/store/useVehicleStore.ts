"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type VehicleState = {
  vehicleId: number | null;
  patente: string | null;
  setVehicle: (id: number, patente: string) => void;
  clearVehicle: () => void;
};

export const useVehicleStore = create<VehicleState>()(
  persist(
    (set) => ({
      vehicleId: null,
      patente: null,
      setVehicle: (vehicleId, patente) => set({ vehicleId, patente }),
      clearVehicle: () => set({ vehicleId: null, patente: null }),
    }),
    { name: "fuelops-vehicle" },
  ),
);
