"use client";

import { adminLogin } from "@/lib/admin-api";
import { useAdminAuth } from "@/store/useAdminAuth";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const setSession = useAdminAuth((s) => s.setSession);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!username.trim() || !password) {
      setErr("Ingresá usuario y contraseña.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await adminLogin(username.trim(), password);
      setSession({
        token: r.token,
        username: r.username,
        expiresAt: r.expires_at,
        fullName: r.full_name ?? null,
      });
      const nextRaw = search?.get("next") ?? "/admin";
      const next = nextRaw.startsWith("/admin") ? nextRaw : "/admin";
      router.replace(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-field-bg p-6">
      <div className="card w-full max-w-md p-7 shadow-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/logo-irrigacion.svg" alt="Irrigación Malargüe" width={180} height={40} priority />
          <div>
            <h1 className="text-xl font-semibold text-brand">Panel de administración</h1>
            <p className="mt-1 text-sm text-field-muted">Ingresá con tu usuario admin para continuar.</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4" autoComplete="on">
          <label className="block text-sm">
            <span className="text-field-muted">Usuario</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="input-field !min-h-0 mt-1 py-2"
              disabled={submitting}
            />
          </label>
          <label className="block text-sm">
            <span className="text-field-muted">Contraseña</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="input-field !min-h-0 w-full py-2 pr-20"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-1 rounded-md px-2 text-xs font-medium text-field-muted hover:bg-field-surface hover:text-field-accent"
                tabIndex={-1}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          {err ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </p>
          ) : null}

          <button type="submit" disabled={submitting} className="btn-primary min-h-12 disabled:opacity-60">
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-field-muted">
          Si olvidaste tu contraseña, contactá al responsable del sistema.
        </p>
      </div>
    </div>
  );
}
