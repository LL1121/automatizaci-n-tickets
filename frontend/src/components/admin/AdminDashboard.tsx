"use client";

import { AdminTicketPanel } from "@/components/admin/AdminTicketPanel";
import type { AdminSortKey, AdminSortOrder, AdminTicketRow, AdminSummary, VehicleStat } from "@/lib/admin-api";
import {
  exportMonthlyUrl,
  fetchAdminSummary,
  fetchAdminTickets,
  fetchAdminVehicleStats,
  monthUtcIsoRange,
  ticketImageUrl,
} from "@/lib/admin-api";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LOW_CONF = 0.75;

function useMonthState() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const prev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };
  return { year, month, prev, next };
}

function SortHead({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: AdminSortOrder;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 font-medium hover:text-white ${active ? "text-cyan-400" : "text-zinc-400"}`}
    >
      {label}
      {active ? <span className="text-xs opacity-80">{order === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

export function AdminDashboard() {
  const { year, month, prev, next } = useMonthState();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [vehicles, setVehicles] = useState<VehicleStat[]>([]);
  const [tickets, setTickets] = useState<AdminTicketRow[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [sort, setSort] = useState<{ by: AdminSortKey; ord: AdminSortOrder }>({
    by: "ingested_at",
    ord: "desc",
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTicketRow | null>(null);

  const range = useMemo(() => monthUtcIsoRange(year, month), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, v, t] = await Promise.all([
        fetchAdminSummary(year, month),
        fetchAdminVehicleStats(year, month),
        fetchAdminTickets({
          from: range.from,
          to: range.to,
          sortBy: sort.by,
          sortOrder: sort.ord,
          limit: 150,
          offset: 0,
        }),
      ]);
      setSummary(s);
      setVehicles(v.vehicles);
      setTickets(t.items);
      setTotalTickets(t.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [year, month, range.from, range.to, sort.by, sort.ord]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtMoney = useMemo(
    () => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
    [],
  );

  const chartData = useMemo(
    () =>
      vehicles.map((v) => ({
        patente: v.patente.length > 12 ? `${v.patente.slice(0, 11)}…` : v.patente,
        litros: Math.round(v.total_litros * 10) / 10,
      })),
    [vehicles],
  );

  const toggleSort = useCallback((key: AdminSortKey) => {
    setSort((s) =>
      s.by === key ? { ...s, ord: s.ord === "asc" ? "desc" : "asc" } : { by: key, ord: key === "patente" ? "asc" : "desc" },
    );
  }, []);

  const columns = useMemo<ColumnDef<AdminTicketRow>[]>(
    () => [
      {
        id: "thumb",
        header: "",
        cell: ({ row }) => (
          <div className="h-10 w-14 shrink-0 overflow-hidden rounded border border-zinc-700 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ticketImageUrl(row.original.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        ),
        size: 72,
      },
      {
        accessorKey: "patente",
        header: () => (
          <SortHead label="Patente" active={sort.by === "patente"} order={sort.ord} onClick={() => toggleSort("patente")} />
        ),
        cell: ({ getValue }) => <span className="font-mono text-sm text-zinc-200">{(getValue() as string) ?? "—"}</span>,
      },
      {
        id: "fecha",
        header: () => (
          <SortHead label="Fecha ticket" active={sort.by === "fecha"} order={sort.ord} onClick={() => toggleSort("fecha")} />
        ),
        cell: ({ row }) => {
          const r = row.original;
          const d = r.fecha ?? r.ingested_at;
          return <span className="text-sm text-zinc-300">{d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>;
        },
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) => <span className="text-sm tabular-nums">{getValue() != null ? Number(getValue()).toFixed(2) : "—"}</span>,
      },
      {
        accessorKey: "monto",
        header: "Monto",
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums text-zinc-300">
            {getValue() != null ? fmtMoney.format(Number(getValue())) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "confidence_score",
        header: "IA %",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className={`text-sm tabular-nums ${v != null && v < LOW_CONF ? "text-rose-400" : "text-zinc-400"}`}>
              {v != null ? `${(v * 100).toFixed(0)}%` : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "is_verified",
        header: "Estado",
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Verificado</span>
          ) : (
            <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-500">Pendiente</span>
          ),
      },
    ],
    [fmtMoney, sort.by, sort.ord, toggleSort],
  );

  const table = useReactTable({
    data: tickets,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rowTone = (r: AdminTicketRow) => {
    if (r.is_verified) return "";
    if (r.confidence_score != null && r.confidence_score < LOW_CONF) return "bg-rose-950/35 hover:bg-rose-950/45";
    return "hover:bg-zinc-800/40";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <h1 className="text-xl font-semibold capitalize text-white">
            {new Date(Date.UTC(year, month - 1, 1)).toLocaleString("es-AR", { month: "long", year: "numeric" })}
          </h1>
          <button
            type="button"
            onClick={next}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
        <a
          href={exportMonthlyUrl(year, month)}
          download
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-zinc-100 px-5 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Exportar Excel (.xlsx)
        </a>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{err}</div>
      ) : null}

      {loading && !summary ? (
        <p className="text-sm text-zinc-500">Cargando métricas…</p>
      ) : summary ? (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total litros (mes)</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{summary.total_litros.toLocaleString("es-AR", { maximumFractionDigits: 1 })} L</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Gasto total</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-cyan-400">{fmtMoney.format(summary.total_monto)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cantidad de cargas</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{summary.cantidad_cargas}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">Litros por patente (mes)</h2>
        <div className="h-72 w-full">
          {chartData.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin datos en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="patente" tick={{ fill: "#a1a1aa", fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} width={44} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  labelStyle={{ color: "#fafafa" }}
                  formatter={(v: number) => [`${v} L`, "Litros"]}
                />
                <Bar dataKey="litros" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#0c0e12]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Auditoría de tickets</h2>
          <span className="text-xs text-zinc-500">
            Mostrando {tickets.length} de {totalTickets} · Confianza baja (&lt; {(LOW_CONF * 100).toFixed(0)}%) resaltada
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 font-medium">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-zinc-800/80 ${rowTone(row.original)}`}
                  onClick={() => setSelected(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <AdminTicketPanel
          ticket={selected}
          onClose={() => setSelected(null)}
          onSaved={(row) => {
            setTickets((prev) => prev.map((t) => (t.id === row.id ? { ...t, ...row } : t)));
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
