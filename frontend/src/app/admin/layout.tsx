import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fuel-Ops · Admin",
  description: "Auditoría y analítica de combustible",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#07080a] text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-[#0c0e12]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-6">
            <Link href="/admin" className="text-lg font-semibold tracking-tight text-white">
              Fuel-Ops <span className="text-cyan-400/90">Admin</span>
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-400">
              <Link href="/admin" className="hover:text-white">
                Dashboard
              </Link>
            </nav>
          </div>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← App campo
          </Link>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
