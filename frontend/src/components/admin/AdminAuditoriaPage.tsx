"use client";

import { AdminTicketPanel } from "@/components/admin/AdminTicketPanel";
import {
  type AdminTicketRow,
  type AdminVehicleRow,
  type YpfReconcileSummary,
  exportPlanillaOficialUrl,
  fetchAdminTickets,
  listAdminVehicles,
  monthUtcIsoRange,
  patchAdminVehicle,
  uploadYpfReport,
} from "@/lib/admin-api";
import { UNIDAD_MEDIDA_OPTIONS, VEHICLE_TIPO_OPTIONS, nombrePlanilla, unidadMedidaDeConsumo } from "@/lib/circular";
import { useAdminAuth } from "@/store/useAdminAuth";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FiltroYpf = "inconsistencias" | "todos" | "conciliado" | "pendiente" | "discrepancia";

function YpfBadge({ row }: { row: AdminTicketRow }) {
  if (row.discrepancia_litros) {
    const diferencia =
      row.litros != null && row.ypf_litros != null ? Math.abs(row.litros - row.ypf_litros) : null;
    const title =
      diferencia != null
        ? `El ticket tiene ${row.litros?.toLocaleString("es-AR")} L y YPF ${row.ypf_litros?.toLocaleString("es-AR")} L (diferencia ${diferencia.toLocaleString("es-AR")} L).`
        : "Los litros del ticket no coinciden con YPF.";
    return (
      <span
        title={title}
        className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
      >
        Discrepancia en litros
      </span>
    );
  }
  if (row.match_ypf_ruta) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-verifiedBg px-2.5 py-0.5 text-xs font-medium text-status-verifiedText">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Conciliado con YPF
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Pendiente de YPF
    </span>
  );
}

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
  const [filtroYpf, setFiltroYpf] = useState<FiltroYpf>("inconsistencias");
  const [ypfBusy, setYpfBusy] = useState(false);
  const [ypfResumen, setYpfResumen] = useState<YpfReconcileSummary | null>(null);
  const [ypfErr, setYpfErr] = useState<string | null>(null);
  const ypfInputRef = useRef<HTMLInputElement>(null);
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
          inconsistencias: filtroYpf === "inconsistencias",
          ypf:
            filtroYpf === "conciliado" || filtroYpf === "pendiente" || filtroYpf === "discrepancia"
              ? filtroYpf
              : undefined,
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
  }, [year, month, filtroYpf]);

  const onYpfFile = async (file: File | undefined) => {
    if (!file) return;
    setYpfBusy(true);
    setYpfErr(null);
    try {
      const summary = await uploadYpfReport(file);
      setYpfResumen(summary);
      await load();
    } catch (e) {
      setYpfErr(e instanceof Error ? e.message : "No se pudo conciliar el PDF.");
    } finally {
      setYpfBusy(false);
      if (ypfInputRef.current) ypfInputRef.current.value = "";
    }
  };

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
          <a
            href={planillaHref}
            className="btn-primary px-4 py-2 text-sm"
            download={nombrePlanilla(month)}
          >
            Descargar planilla oficial
          </a>
          <input
            ref={ypfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void onYpfFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-secondary !min-h-0 px-4 py-2 text-sm"
            disabled={ypfBusy}
            onClick={() => ypfInputRef.current?.click()}
          >
            {ypfBusy ? "Conciliando…" : "Cargar reporte YPF en Ruta (PDF)"}
          </button>
        </div>
      </div>

      {ypfResumen ? (
        <p className="rounded-lg bg-brand-light px-4 py-3 text-sm text-brand">
          Total registros YPF: {ypfResumen.total_ypf} | Conciliados con éxito: {ypfResumen.conciliados} |
          Sin ticket físico respaldado: {ypfResumen.sin_ticket}
          {ypfResumen.discrepancias > 0 ? ` | Discrepancias de litros: ${ypfResumen.discrepancias}` : ""}
        </p>
      ) : null}
      {ypfErr ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{ypfErr}</p> : null}

      {err ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p> : null}
      {fleetMsg ? <p className="text-sm text-brand">{fleetMsg}</p> : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-field-border bg-field-surface px-5 py-3">
          <h2 className="font-semibold text-field-text">
            {filtroYpf === "inconsistencias" ? "Inconsistencias" : "Tickets"} ({loading ? "…" : total})
          </h2>
          <label className="text-sm text-field-muted">
            Estado YPF
            <select
              className="input-field !min-h-0 ml-2 py-1.5 text-sm"
              value={filtroYpf}
              onChange={(e) => setFiltroYpf(e.target.value as FiltroYpf)}
            >
              <option value="inconsistencias">Inconsistencias</option>
              <option value="todos">Todos</option>
              <option value="conciliado">Solo conciliados</option>
              <option value="pendiente">Sin conciliar</option>
              <option value="discrepancia">Discrepancias</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">YPF</th>
                <th className="px-4 py-3">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-field-muted">
                    Sin tickets para este filtro en el período.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className={`cursor-pointer border-t border-field-border hover:bg-blue-50/30 ${
                    row.rendicion_tardia ? "bg-status-lateBg text-status-lateText" : ""
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
                      <YpfBadge row={row} />
                      {row.alerta_tanque ? (
                        <span className="rounded-full bg-status-lateBg px-2.5 py-0.5 text-xs font-medium text-status-lateText">
                          Volumen cargado supera la capacidad máxima del tanque físico
                        </span>
                      ) : null}
                      {row.alerta_telemetria ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          La lectura no cierra con el odómetro o el horómetro
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.rendicion_tardia ? (
                        <span className="rounded-full bg-status-lateBg px-2.5 py-0.5 text-xs font-medium text-status-lateText">
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
            En kilómetros el consumo esperado es L/100 km. En horas de motor, L/hora. El umbral de desvío sigue en 0,15 (15%).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="table-header">
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
              const stillBad =
                filtroYpf !== "inconsistencias" ||
                row.rendicion_tardia ||
                row.desvio_detectado ||
                row.alerta_tanque ||
                row.alerta_telemetria;
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
  const [unidad, setUnidad] = useState(
    vehicle.unidad_medida || unidadMedidaDeConsumo(vehicle.unidad_consumo),
  );
  const [umbral, setUmbral] = useState(String(vehicle.umbral_desvio ?? 0.15));

  useEffect(() => {
    setTipo(vehicle.tipo ?? "");
    setModelo(vehicle.modelo ?? "");
    setConsumo(vehicle.consumo_esperado != null ? String(vehicle.consumo_esperado) : "");
    setUnidad(vehicle.unidad_medida || unidadMedidaDeConsumo(vehicle.unidad_consumo));
    setUmbral(String(vehicle.umbral_desvio ?? 0.15));
  }, [vehicle]);

  return (
    <tr className="border-t border-field-border hover:bg-blue-50/30">
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
          placeholder={tipo === "maquinaria" ? "Retroexcavadora" : "CAPTUR"}
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
          {UNIDAD_MEDIDA_OPTIONS.map((o) => (
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
              unidad_medida: unidad,
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
