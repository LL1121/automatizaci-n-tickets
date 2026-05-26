"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ModalBackdrop } from "@/components/ui/ModalBackdrop";
import {
  type AdminUserDto,
  createAdminUser,
  listAdminUsers,
  patchAdminUser,
  resetAdminPassword,
} from "@/lib/admin-api";
import { useAdminAuth } from "@/store/useAdminAuth";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type CreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (a: AdminUserDto) => void;
};

function CreateAdminModal({ open, onClose, onCreated }: CreateModalProps) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername("");
      setFullName("");
      setPassword("");
      setErr(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!username.trim() || !password) {
      setErr("Ingresá usuario y contraseña.");
      return;
    }
    if (password.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAdminUser({
        username: username.trim(),
        password,
        full_name: fullName.trim() || null,
      });
      onCreated(created);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo crear el usuario.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <ModalBackdrop open={open} onClose={onClose} zIndex={80} />
      <div
        className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal
        aria-labelledby="new-admin-title"
      >
        <form onSubmit={submit} className="card pointer-events-auto w-full max-w-md p-6 shadow-lg">
          <h2 id="new-admin-title" className="text-lg font-semibold text-field-text">
            Nuevo usuario administrador
          </h2>
          <p className="mt-1 text-sm text-field-muted">
            El usuario podrá entrar al panel con la contraseña que definas. Después de crearlo, pasale las credenciales por un canal seguro.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <label className="block text-sm">
              <span className="text-field-muted">Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej. lautaro"
                autoComplete="off"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
            <label className="block text-sm">
              <span className="text-field-muted">Nombre completo (opcional)</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre y apellido visible en el panel"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
            <label className="block text-sm">
              <span className="text-field-muted">Contraseña inicial</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
          </div>

          {err ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary sm:min-w-[6rem]">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary sm:min-w-[8rem]">
              {submitting ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

type ResetModalProps = {
  open: boolean;
  target: AdminUserDto | null;
  onClose: () => void;
  onDone: () => void;
};

function ResetPasswordModal({ open, target, onClose, onDone }: ResetModalProps) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setRepeat("");
      setErr(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setErr(null);
    if (password.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== repeat) {
      setErr("La confirmación no coincide.");
      return;
    }
    setSubmitting(true);
    try {
      await resetAdminPassword(target.id, password);
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar la contraseña.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !target || typeof document === "undefined") return null;

  return createPortal(
    <>
      <ModalBackdrop open={open} onClose={onClose} zIndex={80} />
      <div
        className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal
        aria-labelledby="reset-admin-title"
      >
        <form onSubmit={submit} className="card pointer-events-auto w-full max-w-md p-6 shadow-lg">
          <h2 id="reset-admin-title" className="text-lg font-semibold text-field-text">
            Resetear contraseña
          </h2>
          <p className="mt-1 text-sm text-field-muted">
            Vas a forzar una contraseña nueva para <span className="font-medium text-field-text">@{target.username}</span>.
            La sesión activa del usuario seguirá vigente hasta que expire el token.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <label className="block text-sm">
              <span className="text-field-muted">Nueva contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
            <label className="block text-sm">
              <span className="text-field-muted">Repetir nueva contraseña</span>
              <input
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
                className="input-field !min-h-0 mt-1 py-2"
                disabled={submitting}
              />
            </label>
          </div>

          {err ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary sm:min-w-[6rem]">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary sm:min-w-[8rem]">
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

export function AdminUsersPage() {
  const myUsername = useAdminAuth((s) => s.username);
  const [items, setItems] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUserDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setItems(await listAdminUsers());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleActive = async (target: AdminUserDto) => {
    setBusyId(target.id);
    try {
      const updated = await patchAdminUser(target.id, { is_active: !target.is_active });
      setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setToast(updated.is_active ? `«${updated.username}» activado.` : `«${updated.username}» desactivado.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "No se pudo actualizar el usuario.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Usuarios administradores</h1>
          <p className="mt-1 text-sm text-field-muted">
            Gestioná quiénes pueden entrar al panel. Los usuarios desactivados pierden acceso al instante.
          </p>
        </div>
        <button type="button" onClick={() => setOpenCreate(true)} className="btn-primary min-h-11">
          Nuevo administrador
        </button>
      </header>

      {toast ? (
        <div className="rounded-lg border border-brand/20 bg-brand-light px-4 py-2 text-sm text-brand">{toast}</div>
      ) : null}
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-field-border bg-field-surface text-xs uppercase text-field-muted">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Creado</th>
                <th className="px-4 py-3 font-medium">Último ingreso</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-field-muted">
                    Cargando usuarios…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-field-muted">
                    Todavía no hay administradores cargados.
                  </td>
                </tr>
              ) : (
                items.map((a, idx) => {
                  const isMe = myUsername != null && myUsername === a.username;
                  const rowBg = idx % 2 === 1 ? "bg-field-surface" : "bg-white";
                  return (
                    <tr key={a.id} className={`border-b border-field-border ${rowBg}`}>
                      <td className="px-4 py-3 font-mono text-field-text">
                        @{a.username}
                        {isMe ? <span className="ml-2 rounded-full bg-brand-light px-2 py-0.5 text-xs text-brand">vos</span> : null}
                      </td>
                      <td className="px-4 py-3 text-field-muted">{a.full_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.is_active
                              ? "bg-status-verifiedBg text-status-verifiedText"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {a.is_active ? "Activo" : "Desactivado"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-field-muted">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-3 text-field-muted">{formatDate(a.last_login_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setResetTarget(a)}
                            className="rounded-lg border border-field-border bg-white px-3 py-1.5 text-xs font-medium text-field-text hover:bg-brand-light hover:text-brand"
                          >
                            Resetear contraseña
                          </button>
                          {a.is_active ? (
                            <button
                              type="button"
                              disabled={isMe || busyId === a.id}
                              onClick={() => setConfirmTarget(a)}
                              className="rounded-lg border border-field-border bg-white px-3 py-1.5 text-xs font-medium text-field-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              title={isMe ? "No podés desactivar tu propio usuario" : undefined}
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => void toggleActive(a)}
                              className="rounded-lg border border-field-border bg-white px-3 py-1.5 text-xs font-medium text-field-accent hover:bg-brand-light disabled:opacity-50"
                            >
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CreateAdminModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={(a) => {
          setItems((prev) => [...prev, a].sort((x, y) => x.username.localeCompare(y.username)));
          setToast(`Usuario «${a.username}» creado.`);
        }}
      />

      <ResetPasswordModal
        open={resetTarget != null}
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={() => setToast("Contraseña actualizada.")}
      />

      <ConfirmDialog
        open={confirmTarget != null}
        title="¿Desactivar administrador?"
        message={
          confirmTarget
            ? `«${confirmTarget.username}» dejará de poder iniciar sesión. Podés reactivarlo más adelante.`
            : ""
        }
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="danger"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) void toggleActive(confirmTarget);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}
