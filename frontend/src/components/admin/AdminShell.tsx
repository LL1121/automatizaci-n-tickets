"use client";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAdminAuth } from "@/store/useAdminAuth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const LOGIN_PATH = "/admin/login";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === LOGIN_PATH;
  const hydrated = useAdminAuth((s) => s.hydrated);
  const isAuth = useAdminAuth((s) => s.isAuthenticated());

  useEffect(() => {
    if (!hydrated) return;
    if (isLogin) {
      if (isAuth) router.replace("/admin");
      return;
    }
    if (!isAuth) {
      const next = encodeURIComponent(pathname || "/admin");
      router.replace(`${LOGIN_PATH}?next=${next}`);
    }
  }, [hydrated, isAuth, isLogin, pathname, router]);

  if (isLogin) {
    return <main className="min-h-dvh bg-field-bg">{children}</main>;
  }

  if (!hydrated || !isAuth) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-field-bg">
        <p className="text-sm text-field-muted">Verificando sesión…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh bg-field-surface">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
