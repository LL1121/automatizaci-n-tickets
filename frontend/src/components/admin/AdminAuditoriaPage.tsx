"use client";

import { AdminTicketPanel } from "@/components/admin/AdminTicketPanel";
import {
  type AdminTicketRow,
  type AdminVehicleRow,
  exportPlanillaOficialUrl,
  fetchAdminTickets,
  listAdminVehicles,
  monthUtcIsoRange,
  patchAdminVehicle,
} from "@/lib/admin-api";
import { UNIDAD_CONSUMO_OPTIONS, VEHICLE_TIPO_OPTIONS } from "@/lib/circular";
import { useAdminAuth } from "@/store/useAdminAuth";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function pctLabel(pct: number | null): string {
  if (pct == null) return "—";
  return `${(pct * 100).toFixed(0)}%`;
}

export function AdminAuditoriaPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<AdminTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTicketRow | null>(null);
  const [vehicles, setVehicles] = useState<AdminVehicleRow[]>([]);
  const [fleetBusy, setFleetBusy] = useState<number | null>(null);
  const [fleetMsg, setFleetMsg] = useState<string | null>(null);
  const token = useAdminAuth((s) => s.token);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { from, to } = monthUtcIsoRange(year, month);
      const [ticketsRes, fleet] = await Promise.all([
        fetchAdminTickets({
          from,
          to,
          sortBy: "fecha",
          sortOrder: "desc",
          limit: 200,
          inconsistencias: true,
        }),
        listAdminVehicles(),
      ]);
      setItems(ticketsRes.items);
      setTotal(ticketsRes.total);
      setVehicles(fleet);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar auditoría");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveVehicle = async (id: number, patch: Parameters<typeof patchAdminVehicle>[1]) => {
    setFleetBusy(id);
    setFleetMsg(null);
    try {
      const updated = await patchAdminVehicle(id, patch);
      setVehicles((prev) => prev.map((v) => (v.id === id ? updated : v)));
      setFleetMsg("Flota actualizada.");
    } catch (e) {
      setFleetMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setFleetBusy(null);
    }
  };

  const planillaHref = exportPlanillaOficialUrl(year, month, token);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Auditoría y Desvíos</h1>
          <p className="mt-1 text-sm text-field-muted">
            Circular 08/2026 — rendición tardía (&gt; 48 h hábiles) y consumo por encima del esperado.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-field-muted">Año</span>
            <input
              type="number"
              className="input-field !min-h-0 mt-1 w-24 py-2"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-field-muted">Mes</span>
            <select
              className="input-field !min-h-0 mt-1 py-2"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <a href={planillaHref} className="btn-primary px-4 py-2 text-sm" download>
            Descargar planilla oficial
          </a>
        </div>
      </div>

      {err ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p> : null}
      {fleetMsg ? <p className="text-sm text-brand">{fleetMsg}</p> : null}

      <section className="card overflow-hidden">
        <div className="border-b border-field-border bg-field-surface px-5 py-3">
          <h2 className="font-semibold text-field-text">
            Inconsistencias ({loading ? "…" : total})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand/5 text-xs uppercase tracking-wide text-field-muted">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-field-muted">
                    Sin inconsistencias en el período.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className={`cursor-pointer border-t border-field-border hover:bg-brand-light/40 ${
                    row.rendicion_tardia ? "bg-red-50 text-red-900" : ""
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.fecha ?? row.ingested_at)}</td>
                  <td className="px-4 py-3 font-mono">{row.patente ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div>{row.nombre_conductor ?? "—"}</div>
                    <div className="text-xs text-field-muted">
                      {row.legajo_conductor ? `Legajo ${row.legajo_conductor}` : ""}
                      {row.tipo_actividad ? ` · ${row.tipo_actividad}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.litros != null ? row.litros.toLocaleString("es-AR") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.rendicion_tardia ? (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                          Rendición tardía
                        </span>
                      ) : null}
                      {row.desvio_detectado ? (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                          Desvío {pctLabel(row.desvio_pct)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-field-border bg-field-surface px-5 py-3">
          <h2 className="font-semibold text-field-text">Flota — consumo esperado</h2>
          <p className="text-xs text-field-muted">
            Parametrizá L/100 km o L/hora y el umbral de desvío (ej. 0.15 = 15%).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand/5 text-xs uppercase tracking-wide text-field-muted">
              <tr>
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Consumo esperado</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">Umbral</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <VehicleFleetRow
                  key={v.id}
                  vehicle={v}
                  busy={fleetBusy === v.id}
                  onSave={(patch) => void saveVehicle(v.id, patch)}
                />
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
            setItems((prev) => {
              const stillBad = row.rendicion_tardia || row.desvio_detectado;
              if (!stillBad) return prev.filter((x) => x.id !== row.id);
              return prev.map((x) => (x.id === row.id ? row : x));
            });
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}

function VehicleFleetRow({
  vehicle,
  busy,
  onSave,
}: {
  vehicle: AdminVehicleRow;
  busy: boolean;
  onSave: (patch: Parameters<typeof patchAdminVehicle>[1]) => void;
}) {
  const [tipo, setTipo] = useState(vehicle.tipo ?? "");
  const [modelo, setModelo] = useState(vehicle.modelo ?? "");
  const [consumo, setConsumo] = useState(
    vehicle.consumo_esperado != null ? String(vehicle.consumo_esperado) : "",
  );
  const [unidad, setUnidad] = useState(vehicle.unidad_consumo || "l_100km");
  const [umbral, setUmbral] = useState(String(vehicle.umbral_desvio ?? 0.15));

  useEffect(() => {
    setTipo(vehicle.tipo ?? "");
    setModelo(vehicle.modelo ?? "");
    setConsumo(vehicle.consumo_esperado != null ? String(vehicle.consumo_esperado) : "");
    setUnidad(vehicle.unidad_consumo || "l_100km");
    setUmbral(String(vehicle.umbral_desvio ?? 0.15));
  }, [vehicle]);

  return (
    <tr className="border-t border-field-border">
      <td className="px-4 py-3 font-mono font-medium">{vehicle.patente}</td>
      <td className="px-4 py-2">
        <select
          className="input-field !min-h-0 py-1.5 text-sm"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">—</option>
          {VEHICLE_TIPO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          className="input-field !min-h-0 w-36 py-1.5"
          value={modelo}
          placeholder="CAPTUR"
          onChange={(e) => setModelo(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.1"
          className="input-field !min-h-0 w-24 py-1.5"
          value={consumo}
          onChange={(e) => setConsumo(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <select
          className="input-field !min-h-0 py-1.5 text-sm"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
        >
          {UNIDAD_CONSUMO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          min={0}
          max={2}
          className="input-field !min-h-0 w-20 py-1.5"
          value={umbral}
          onChange={(e) => setUmbral(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          onClick={() =>
            onSave({
              tipo: tipo || null,
              modelo: modelo.trim() || null,
              consumo_esperado: consumo.trim() === "" ? null : Number(consumo.replace(",", ".")),
              unidad_consumo: unidad,
              umbral_desvio: Number(umbral.replace(",", ".")),
            })
          }
        >
          {busy ? "…" : "Guardar"}
        </button>
      </td>
    </tr>
  );
}
