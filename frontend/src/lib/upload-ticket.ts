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

export async function uploadTicketFile(
  file: File,
  vehicleId: number,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  form.append("vehicle_id", String(vehicleId));

  const res = await fetch(`${getApiBase()}/upload`, {
    method: "POST",
    body: form,
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new UploadHttpError(
      `Upload falló (${res.status})`,
      res.status,
      bodyText.slice(0, 500),
    );
  }

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new UploadHttpError("Respuesta no JSON", res.status, bodyText);
  }
}
