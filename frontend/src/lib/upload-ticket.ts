import { getApiBase } from "@/lib/api";
import { QUOTA_BLOCKED_STATUSES } from "@/lib/sync-policy";

export class UploadHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "UploadHttpError";
  }
}

const MISSING_VEHICLE =
  /veh[ií]culo_id|vehicle_id|no corresponde a un veh[ií]culo|no existe la columna|column ["']?veh|no encontramos la patente/i;

export function isMissingVehicleDetail(detail: string): boolean {
  return MISSING_VEHICLE.test(detail);
}

/** Traduce el error técnico de vehículo a un aviso de patente para el conductor. */
export function humanizeUploadDetail(detail: string, patente?: string | null): string {
  const text = detail.trim();
  if (!isMissingVehicleDetail(text)) return text;
  const plate = patente?.trim();
  if (plate) {
    return `No encontramos la patente ${plate}. Volvé a elegir el vehículo en la lista.`;
  }
  return "No encontramos la patente de ese vehículo. Volvé a elegirla en la lista.";
}

export function isQuotaBlockedError(error: unknown): boolean {
  return error instanceof UploadHttpError && QUOTA_BLOCKED_STATUSES.has(error.status);
}

/**
 * Fallo definitivo del cliente (no reintentar en cola automática).
 * 429 = cuota Gemini: nunca en bucle automático.
 */
export function isPermanentUploadFailure(error: unknown): boolean {
  if (!(error instanceof UploadHttpError)) return false;
  const s = error.status;
  if (isQuotaBlockedError(error)) return true;
  if (s >= 500) return false;
  if (s === 408) return false;
  return s >= 400;
}

export type UploadConductorMeta = {
  legajoConductor: string;
  nombreConductor: string;
  tipoActividad: string;
};

export async function uploadTicketFile(
  file: File,
  vehicleId: number,
  deviceUid: string,
  conductor?: UploadConductorMeta,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  form.append("vehicle_id", String(vehicleId));
  form.append("device_uid", deviceUid);
  if (conductor) {
    form.append("legajo_conductor", conductor.legajoConductor);
    form.append("nombre_conductor", conductor.nombreConductor);
    form.append("tipo_actividad", conductor.tipoActividad);
  }

  const res = await fetch(`${getApiBase()}/upload`, {
    method: "POST",
    body: form,
  });

  const bodyText = await res.text();
  if (!res.ok) {
    let detail = bodyText.slice(0, 500);
    try {
      const j = JSON.parse(bodyText) as { detail?: string };
      if (typeof j.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new UploadHttpError(`Upload falló (${res.status})`, res.status, detail);
  }

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new UploadHttpError("Respuesta no JSON", res.status, bodyText);
  }
}
