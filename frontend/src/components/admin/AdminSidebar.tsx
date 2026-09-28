"use client";

import { ChangeMyPasswordDialog } from "@/components/admin/ChangeMyPasswordDialog";
import { useAdminAuth } from "@/store/useAdminAuth";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavItem = { href: string; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
        />
      </svg>
    ),
  },
  {
    href: "/admin/auditoria",
    label: "Auditoría y Desvíos",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Usuarios admin",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 014-4h2a4 4 0 014 4v2m-3-10a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const username = useAdminAuth((s) => s.username);
  const fullName = useAdminAuth((s) => s.fullName);
  const clear = useAdminAuth((s) => s.clear);
  const display = fullName?.trim() || username || "Administrador";
  const initial = display.trim().charAt(0).toUpperCase() || "A";
  const [openChangePwd, setOpenChangePwd] = useState(false);

  const logout = () => {
    clear();
    router.replace("/admin/login");
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-brand text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/admin" className="block">
          <Image src="/logo-irrigacion.svg" alt="Irrigación Malargüe" width={180} height={40} priority />
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-white/70">Combustible · Admin</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/"
          className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          App campo
        </Link>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{display}</p>
            <p className="truncate text-xs text-white/70">{username ? `@${username}` : "Sesión activa"}</p>
          </div>
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-white/20 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
          onClick={() => setOpenChangePwd(true)}
        >
          Cambiar contraseña
        </button>
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-white/20 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10"
          onClick={logout}
        >
          Cerrar sesión
        </button>
      </div>

      <ChangeMyPasswordDialog open={openChangePwd} onClose={() => setOpenChangePwd(false)} />
    </aside>
  );
}
