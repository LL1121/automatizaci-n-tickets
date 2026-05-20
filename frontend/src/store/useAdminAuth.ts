"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type AdminAuthState = {
  token: string | null;
  username: string | null;
  expiresAt: string | null;
  /** Marca para forzar redirecciones después de un 401 cliente. */
  hydrated: boolean;
  setSession: (s: { token: string; username: string; expiresAt: string }) => void;
  clear: () => void;
  setHydrated: () => void;
  isAuthenticated: () => boolean;
};

export const useAdminAuth = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      expiresAt: null,
      hydrated: false,
      setSession: ({ token, username, expiresAt }) =>
        set({ token, username, expiresAt }),
      clear: () => set({ token: null, username: null, expiresAt: null }),
      setHydrated: () => set({ hydrated: true }),
      isAuthenticated: () => {
        const { token, expiresAt } = get();
        if (!token) return false;
        if (expiresAt) {
          const exp = Date.parse(expiresAt);
          if (!Number.isNaN(exp) && Date.now() >= exp) return false;
        }
        return true;
      },
    }),
    {
      name: "fuelops-admin-auth",
      partialize: (s) => ({
        token: s.token,
        username: s.username,
        expiresAt: s.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Útil para llamadas que necesitan el token sin suscribirse al store (fetchers). */
export function getAdminToken(): string | null {
  return useAdminAuth.getState().token;
}

export function clearAdminSession() {
  useAdminAuth.getState().clear();
}
