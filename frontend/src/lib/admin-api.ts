import { getApiBase } from "@/lib/api";
import { clearAdminSession, getAdminToken } from "@/store/useAdminAuth";

export type AdminSortKey = "fecha" | "patente" | "confidence_score" | "ingested_at" | "id";
export type AdminSortOrder = "asc" | "desc";

export type AdminTicketRow = {
  id: number;
  cuit_proveedor: string;
  nro_ticket: string;
  litros: number | null;
  kilometraje: number | null;
  km_o_horas: number | null;
  tipo_combustible: string | null;
  remito: string | null;
  operador_nombre: string | null;
  legajo_conductor: string | null;
  nombre_conductor: string | null;
  tipo_actividad: string | null;
  estacion_servicio: string | null;
  monto: number | null;
  rendicion_tardia: boolean;
  desvio_detectado: boolean;
  desvio_pct: number | null;
  fecha: string | null;
  ingested_at: string | null;
  url_imagen: string;
  confidence_score: number | null;
  is_verified: boolean;
  verified_at: string | null;
  vehicle_id: number | null;
  patente: string | null;
  vehicle_tipo: string | null;
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

export class AdminUnauthorizedError extends Error {
  constructor(message = "Sesión expirada") {
    super(message);
    this.name = "AdminUnauthorizedError";
  }
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAdminToken();
  const base: Record<string, string> = {};
  if (token) base["Authorization"] = `Bearer ${token}`;
  if (extra) Object.assign(base, extra as Record<string, string>);
  return base;
}

async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: authHeaders(init.headers),
    cache: "no-store",
  });
  if (res.status === 401) {
    clearAdminSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/admin/login?next=${next}`);
    }
    throw new AdminUnauthorizedError();
  }
  return res;
}

export function monthUtcIsoRange(year: number, month: number): { from: string; to: string } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from: start.toISOString(), to: end.toISOString() };
}

export type AdminUserDto = {
  id: number;
  username: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ token: string; username: string; expires_at: string; full_name?: string | null }> {
  const res = await fetch(`${getApiBase()}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Usuario o contraseña inválidos.");
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function adminMe(): Promise<AdminUserDto> {
  const res = await adminFetch(`${getApiBase()}/admin/auth/me`);
  if (!res.ok) throw new Error(`me ${res.status}`);
  return res.json() as Promise<AdminUserDto>;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    /* ignore */
  }
  return `Error ${res.status}`;
}

export async function listAdminUsers(): Promise<AdminUserDto[]> {
  const res = await adminFetch(`${getApiBase()}/admin/users`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminUserDto[];
}

export async function createAdminUser(body: {
  username: string;
  password: string;
  full_name?: string | null;
}): Promise<AdminUserDto> {
  const res = await adminFetch(`${getApiBase()}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminUserDto;
}

export async function patchAdminUser(
  id: number,
  body: { full_name?: string | null; is_active?: boolean },
): Promise<AdminUserDto> {
  const res = await adminFetch(`${getApiBase()}/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminUserDto;
}

export async function resetAdminPassword(id: number, newPassword: string): Promise<AdminUserDto> {
  const res = await adminFetch(`${getApiBase()}/admin/users/${id}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminUserDto;
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<AdminUserDto> {
  const res = await adminFetch(`${getApiBase()}/admin/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminUserDto;
}

export type BatchFileResult = {
  filename: string;
  status: "ok" | "partial" | "duplicate" | "error";
  tickets: AdminTicketRow[];
  duplicates: number;
  errors: string[];
};

export type BatchUploadResponse = {
  summary: {
    files: number;
    tickets_created: number;
    duplicates: number;
    errors: number;
  };
  results: BatchFileResult[];
};

/** Sube uno o más archivos al endpoint /admin/upload-batch. */
export async function adminUploadBatch(files: File[]): Promise<BatchUploadResponse> {
  if (files.length === 0) {
    return { summary: { files: 0, tickets_created: 0, duplicates: 0, errors: 0 }, results: [] };
  }
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  const res = await adminFetch(`${getApiBase()}/admin/upload-batch`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `upload-batch ${res.status}`);
  }
  return (await res.json()) as BatchUploadResponse;
}

export async function fetchAdminSummary(year: number, month: number): Promise<AdminSummary> {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await adminFetch(`${getApiBase()}/admin/stats/summary?${q}`);
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json() as Promise<AdminSummary>;
}

export async function fetchAdminVehicleStats(year: number, month: number): Promise<{ vehicles: VehicleStat[] }> {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await adminFetch(`${getApiBase()}/admin/stats/vehicles?${q}`);
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
  inconsistencias?: boolean;
}): Promise<{ total: number; items: AdminTicketRow[] }> {
  const q = new URLSearchParams({
    from_date: params.from,
    to_date: params.to,
    sort_by: params.sortBy,
    sort_order: params.sortOrder,
    limit: String(params.limit ?? 100),
    offset: String(params.offset ?? 0),
  });
  if (params.inconsistencias) q.set("inconsistencias", "true");
  const res = await adminFetch(`${getApiBase()}/admin/tickets?${q}`);
  if (!res.ok) throw new Error(`tickets ${res.status}`);
  return res.json() as Promise<{ total: number; items: AdminTicketRow[] }>;
}

export async function patchAdminTicket(
  id: number,
  body: Partial<{
    litros: number | null;
    kilometraje: number | null;
    km_o_horas: number | null;
    remito: string | null;
    fecha: string | null;
    is_verified: boolean;
    legajo_conductor: string | null;
    nombre_conductor: string | null;
    tipo_actividad: string | null;
    estacion_servicio: string | null;
    monto: number | null;
    tipo_combustible: string | null;
  }>,
): Promise<AdminTicketRow> {
  const res = await adminFetch(`${getApiBase()}/admin/tickets/${id}`, {
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

export type AdminVehicleRow = {
  id: number;
  patente: string;
  capacidad_tanque: number | null;
  tipo: string | null;
  modelo: string | null;
  consumo_esperado: number | null;
  unidad_consumo: string;
  umbral_desvio: number;
};

export async function listAdminVehicles(): Promise<AdminVehicleRow[]> {
  const res = await adminFetch(`${getApiBase()}/admin/vehicles`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminVehicleRow[];
}

export async function patchAdminVehicle(
  id: number,
  body: Partial<{
    tipo: string | null;
    modelo: string | null;
    consumo_esperado: number | null;
    unidad_consumo: string | null;
    umbral_desvio: number | null;
    capacidad_tanque: number | null;
  }>,
): Promise<AdminVehicleRow> {
  const res = await adminFetch(`${getApiBase()}/admin/vehicles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AdminVehicleRow;
}

/**
 * URL de imagen del ticket. Como `<img>` no permite headers,
 * adjuntamos el JWT como query param y el backend lo valida igual.
 */
export function ticketImageUrl(id: number, token?: string | null): string {
  const t = token ?? getAdminToken();
  const base = `${getApiBase()}/admin/tickets/${id}/image`;
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}

/**
 * URL del Excel mensual. Igual que la imagen, va por query param para
 * que un `<a download>` no necesite cabeceras.
 */
export function exportMonthlyUrl(year: number, month: number, token?: string | null): string {
  const t = token ?? getAdminToken();
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  if (t) q.set("token", t);
  return `${getApiBase()}/admin/export/monthly.xlsx?${q}`;
}

export function exportPlanillaOficialUrl(year: number, month: number, token?: string | null): string {
  const t = token ?? getAdminToken();
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  if (t) q.set("token", t);
  return `${getApiBase()}/admin/auditoria/planilla.xlsx?${q}`;
}
