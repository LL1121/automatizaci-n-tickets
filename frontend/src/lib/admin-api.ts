import { getApiBase } from "@/lib/api";

export type AdminSortKey = "fecha" | "patente" | "confidence_score" | "ingested_at" | "id";
export type AdminSortOrder = "asc" | "desc";

export type AdminTicketRow = {
  id: number;
  cuit_proveedor: string;
  nro_ticket: string;
  litros: number | null;
  kilometraje: number | null;
  fecha: string | null;
  ingested_at: string | null;
  url_imagen: string;
  confidence_score: number | null;
  is_verified: boolean;
  verified_at: string | null;
  vehicle_id: number | null;
  patente: string | null;
};

export type AdminSummary = {
  year: number;
  month: number;
  total_litros: number;
  total_kilometraje: number;
  cantidad_cargas: number;
};

export type VehicleStat = {
  vehicle_id: number | null;
  patente: string;
  total_litros: number;
  cantidad_cargas: number;
};

export function monthUtcIsoRange(year: number, month: number): { from: string; to: string } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function fetchAdminSummary(year: number, month: number): Promise<AdminSummary> {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${getApiBase()}/admin/stats/summary?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json() as Promise<AdminSummary>;
}

export async function fetchAdminVehicleStats(year: number, month: number): Promise<{ vehicles: VehicleStat[] }> {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${getApiBase()}/admin/stats/vehicles?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`vehicles ${res.status}`);
  return res.json() as Promise<{ vehicles: VehicleStat[] }>;
}

export async function fetchAdminTickets(params: {
  from: string;
  to: string;
  sortBy: AdminSortKey;
  sortOrder: AdminSortOrder;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: AdminTicketRow[] }> {
  const q = new URLSearchParams({
    from_date: params.from,
    to_date: params.to,
    sort_by: params.sortBy,
    sort_order: params.sortOrder,
    limit: String(params.limit ?? 100),
    offset: String(params.offset ?? 0),
  });
  const res = await fetch(`${getApiBase()}/admin/tickets?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickets ${res.status}`);
  return res.json() as Promise<{ total: number; items: AdminTicketRow[] }>;
}

export async function patchAdminTicket(
  id: number,
  body: Partial<{ litros: number | null; kilometraje: number | null; fecha: string | null; is_verified: boolean }>,
): Promise<AdminTicketRow> {
  const res = await fetch(`${getApiBase()}/admin/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `PATCH ${res.status}`);
  }
  return res.json() as Promise<AdminTicketRow>;
}

export function ticketImageUrl(id: number): string {
  return `${getApiBase()}/admin/tickets/${id}/image`;
}

export function exportMonthlyUrl(year: number, month: number): string {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  return `${getApiBase()}/admin/export/monthly.xlsx?${q}`;
}
