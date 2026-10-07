"use client";

import { ChangeMyPasswordDialog } from "@/components/admin/ChangeMyPasswordDialog";
import { useAdminAuth } from "@/store/useAdminAuth";
import { ArrowLeft, ClipboardCheck, LayoutDashboard, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavItem = { href: string; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" aria-hidden /> },
  {
    href: "/admin/auditoria",
    label: "Auditoría y Desvíos",
    icon: <ClipboardCheck className="h-5 w-5" aria-hidden />,
  },
  { href: "/admin/users", label: "Usuarios admin", icon: <Users className="h-5 w-5" aria-hidden /> },
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
      <div className="border-b border-brand-cyan/30 px-5 py-5">
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
                active ? "bg-brand-cyan/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
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
          <ArrowLeft className="h-5 w-5" aria-hidden />
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
