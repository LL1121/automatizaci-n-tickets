"use client";

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
  operatorName: string | null;
  token: string | null;
  setSession: (operatorName: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      operatorName: null,
      token: null,
      setSession: (operatorName: string) => {
        writeSessionCookie(operatorName.trim());
        set({ operatorName: operatorName.trim(), token: "mock" });
      },
      logout: () => {
        clearSessionCookie();
        set({ operatorName: null, token: null });
      },
      isAuthenticated: () => Boolean(get().token),
    }),
    {
      name: "fuelops-session",
      partialize: (s) => ({ operatorName: s.operatorName, token: s.token }),
    },
  ),
);
