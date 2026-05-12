import { API_BASE } from "@/lib/api";

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

export function isLikelyNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) {
    const m = error.message.toLowerCase();
    if (m.includes("fetch") || m.includes("network") || m.includes("failed")) return true;
  }
  return false;
}

export async function uploadTicketFile(
  file: File,
  vehicleId: number,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  form.append("vehicle_id", String(vehicleId));

  const res = await fetch(`${API_BASE}/upload`, {
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
