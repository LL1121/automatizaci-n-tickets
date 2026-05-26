"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type AdminAuthState = {
  token: string | null;
  username: string | null;
  fullName: string | null;
  expiresAt: string | null;
  /** Marca para forzar redirecciones después de un 401 cliente. */
  hydrated: boolean;
  setSession: (s: {
    token: string;
    username: string;
    expiresAt: string;
    fullName?: string | null;
  }) => void;
  setFullName: (fullName: string | null) => void;
  clear: () => void;
  setHydrated: () => void;
  isAuthenticated: () => boolean;
};

export const useAdminAuth = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      fullName: null,
      expiresAt: null,
      hydrated: false,
      setSession: ({ token, username, expiresAt, fullName }) =>
        set({ token, username, expiresAt, fullName: fullName ?? null }),
      setFullName: (fullName) => set({ fullName }),
      clear: () => set({ token: null, username: null, fullName: null, expiresAt: null }),
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
        fullName: s.fullName,
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
