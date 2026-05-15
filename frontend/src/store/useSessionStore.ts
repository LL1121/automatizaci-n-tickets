"use client";

import { getOrCreateDeviceUid } from "@/lib/device-id";
import { fetchOperatorByDevice, registerOperator } from "@/lib/operators-api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const COOKIE_NAME = "fuelops_operator";

function writeSessionCookie(operatorName: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 30;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(operatorName)};path=/;max-age=${maxAge};SameSite=Lax`;
}

function clearSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
}

type SessionState = {
  deviceUid: string | null;
  operatorName: string | null;
  token: string | null;
  /** true mientras resolvemos operario en el servidor */
  bootstrapping: boolean;
  bootstrapFromServer: () => Promise<boolean>;
  registerOperator: (nombre: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      deviceUid: null,
      operatorName: null,
      token: null,
      bootstrapping: false,

      bootstrapFromServer: async () => {
        const uid = getOrCreateDeviceUid();
        set({ deviceUid: uid, bootstrapping: true });
        try {
          const profile = await fetchOperatorByDevice(uid);
          if (profile) {
            writeSessionCookie(profile.nombre);
            set({
              deviceUid: uid,
              operatorName: profile.nombre,
              token: "field",
              bootstrapping: false,
            });
            return true;
          }
          set({ deviceUid: uid, operatorName: null, token: null, bootstrapping: false });
          return false;
        } catch {
          const cached = get().operatorName;
          if (cached) {
            set({ deviceUid: uid, token: "field", bootstrapping: false });
            return true;
          }
          set({ deviceUid: uid, operatorName: null, token: null, bootstrapping: false });
          return false;
        }
      },

      registerOperator: async (nombre: string) => {
        const uid = get().deviceUid ?? getOrCreateDeviceUid();
        const profile = await registerOperator(uid, nombre);
        writeSessionCookie(profile.nombre);
        set({
          deviceUid: uid,
          operatorName: profile.nombre,
          token: "field",
          bootstrapping: false,
        });
      },

      logout: () => {
        clearSessionCookie();
        const uid = get().deviceUid ?? getOrCreateDeviceUid();
        set({ deviceUid: uid, operatorName: null, token: null, bootstrapping: false });
      },

      isAuthenticated: () => Boolean(get().token && get().operatorName),
    }),
    {
      name: "fuelops-session",
      partialize: (s) => ({
        deviceUid: s.deviceUid,
        operatorName: s.operatorName,
        token: s.token,
      }),
    },
  ),
);
