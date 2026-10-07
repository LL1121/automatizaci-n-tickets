"use client";

import { AdminBatchUpload } from "@/components/admin/AdminBatchUpload";
import type { LitrosBarRow } from "@/components/admin/AdminLitrosChart";
import { AdminTicketPanel } from "@/components/admin/AdminTicketPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const AdminLitrosChartLazy = dynamic(
  () => import("@/components/admin/AdminLitrosChart").then((m) => m.AdminLitrosChart),
  {
    ssr: false,
    loading: () => <p className="text-sm text-field-muted">Cargando gráfico…</p>,
  },
);

/** Mes/año solo en el cliente para evitar desajuste de hidratación SSR vs navegador. */
function useMonthState() {
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    setYear(now.getUTCFullYear());
    setMonth(now.getUTCMonth() + 1);
  }, []);
  const prev = () => {
    if (year == null || month == null) return;
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const next = () => {
    if (year == null || month == null) return;
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else setMonth(month + 1);
  };
  return { year, month, prev, next, ready: year != null && month != null };
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
      className={`flex items-center gap-1 font-medium hover:text-brand-cyan ${active ? "text-brand" : "text-brand/80"}`}
    >
      {label}
      {active ? <span className="text-xs opacity-80">{order === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

export function AdminDashboard() {
  const { year, month, prev, next, ready } = useMonthState();
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

  const range = useMemo(() => {
    if (!ready || year == null || month == null) {
      return { from: "1970-01-01T00:00:00.000Z", to: "1970-01-31T23:59:59.999Z" };
    }
    return monthUtcIsoRange(year, month);
  }, [ready, year, month]);

  const load = useCallback(async () => {
    if (!ready || year == null || month == null) return;
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
  }, [ready, year, month, range.from, range.to, sort.by, sort.ord]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  const chartData = useMemo((): LitrosBarRow[] => {
    return vehicles.map((v) => ({
      patente: v.patente.length > 12 ? `${v.patente.slice(0, 11)}…` : v.patente,
      litros: Math.round(v.total_litros * 10) / 10,
    }));
  }, [vehicles]);

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
          <div className="h-10 w-14 shrink-0 overflow-hidden rounded border border-field-border bg-field-surface">
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
        cell: ({ getValue }) => <span className="font-mono text-sm text-field-text">{(getValue() as string) ?? "—"}</span>,
      },
      {
        id: "fecha",
        header: () => (
          <SortHead label="Fecha ticket" active={sort.by === "fecha"} order={sort.ord} onClick={() => toggleSort("fecha")} />
        ),
        cell: ({ row }) => {
          const r = row.original;
          const d = r.fecha ?? r.ingested_at;
          return <span className="text-sm text-field-muted">{d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>;
        },
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) => <span className="text-sm tabular-nums">{getValue() != null ? Number(getValue()).toFixed(2) : "—"}</span>,
      },
      {
        accessorKey: "kilometraje",
        header: "Km",
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums text-field-muted">
            {getValue() != null ? Number(getValue()).toLocaleString("es-AR") : "—"}
          </span>
        ),
      },
      {
        accessorKey: "operador_nombre",
        header: "Operario",
        cell: ({ getValue }) => <span className="text-sm text-field-muted">{(getValue() as string) ?? "—"}</span>,
      },
      {
        accessorKey: "remito",
        header: "Remito",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return (
            <span className={`font-mono text-sm ${v ? "text-field-muted" : "text-gray-400"}`}>
              {v ?? "No encontrado"}
            </span>
          );
        },
      },
      {
        accessorKey: "is_verified",
        header: "Estado",
        cell: ({ getValue }) =>
          getValue() ? <StatusBadge variant="verified">Verificado</StatusBadge> : <StatusBadge variant="pending">Pendiente</StatusBadge>,
      },
    ],
    [sort.by, sort.ord, toggleSort],
  );

  const table = useReactTable({
    data: tickets,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rowTone = (r: AdminTicketRow, index: number) => {
    if (r.rendicion_tardia) return "bg-status-lateBg text-status-lateText hover:bg-status-lateBg";
    const alt = index % 2 === 1 ? "bg-field-surface" : "bg-white";
    return `${alt} hover:bg-blue-50/30`;
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-brand">Gestión de combustible</h1>
        <p className="mt-1 text-sm text-field-muted">Auditoría de tickets YPF En Ruta y métricas mensuales.</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={!ready}
            className="btn-secondary !min-h-0 px-3 py-2 disabled:opacity-40"
            aria-label="Mes anterior"
          >
            ←
          </button>
          <h2 className="text-xl font-semibold text-field-text">
            {ready && year != null && month != null ? `${MONTH_NAMES_ES[month - 1]} ${year}` : "…"}
          </h2>
          <button
            type="button"
            onClick={next}
            disabled={!ready}
            className="btn-secondary !min-h-0 px-3 py-2 disabled:opacity-40"
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
        {ready && year != null && month != null ? (
          <a
            href={exportMonthlyUrl(year, month)}
            download
            className="btn-primary min-h-12"
          >
            Exportar Excel (.xlsx)
          </a>
        ) : (
          <span className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-field-surface px-5 text-sm font-semibold text-gray-400">
            Exportar Excel (.xlsx)
          </span>
        )}
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {loading && !summary ? (
        <p className="text-sm text-field-muted">Cargando métricas…</p>
      ) : summary ? (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-field-muted">Total litros (mes)</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-brand">{summary.total_litros.toLocaleString("es-AR", { maximumFractionDigits: 1 })} L</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-field-muted">Km recorridos (mes)</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-brand">
              {summary.total_kilometraje.toLocaleString("es-AR")} km
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-field-muted">Cantidad de cargas</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-brand">{summary.cantidad_cargas}</p>
          </div>
        </section>
      ) : null}

      <AdminBatchUpload onUploaded={() => void load()} />

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold text-brand">Litros por patente</h2>
        <p className="mb-4 text-sm text-field-muted">Consumo del mes seleccionado</p>
        <div className="h-72 w-full">
          {!ready ? (
            <p className="text-sm text-field-muted">Preparando período…</p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-field-muted">Sin datos en este período.</p>
          ) : (
            <AdminLitrosChartLazy data={chartData} />
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-field-border bg-field-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-brand">Auditoría de tickets</h2>
            <p className="text-sm text-field-muted">Revisión y verificación de comprobantes</p>
          </div>
          <span className="text-xs text-field-muted">
            Mostrando {tickets.length} de {totalTickets}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="table-header border-b border-field-border">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 font-medium">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-field-border ${rowTone(row.original, index)}`}
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
