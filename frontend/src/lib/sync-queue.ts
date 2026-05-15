import { getOrCreateDeviceUid } from "@/lib/device-id";
import {
  uploadTicketFile,
  isPermanentUploadFailure,
  isQuotaBlockedError,
  UploadHttpError,
} from "@/lib/upload-ticket";
import { RETRY_BACKOFF_MS } from "@/lib/sync-policy";
import {
  deletePendingTicket,
  getAllPendingTickets,
  putPendingTicket,
  updatePendingTicket,
  type PendingTicketRecord,
  type PendingTicketStatus,
} from "@/lib/offline-db";

export type FlushResult = {
  uploaded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export type FlushOptions = {
  /** Solo ítems en pending con nextRetryAt vencido; ignora failed/quota salvo force. */
  manual?: boolean;
  /** Reintentar también failed / quota_blocked (un intento manual). */
  forceIds?: string[];
  /** Máximo de subidas en esta corrida (control de tokens). */
  maxItems?: number;
};

function friendlyError(e: unknown): string {
  if (e instanceof UploadHttpError) {
    if (isQuotaBlockedError(e)) {
      return "Cuota de IA agotada. Subí manualmente más tarde o cambiá el plan de Gemini.";
    }
    return `${e.status}: ${e.body.slice(0, 120) || e.message}`;
  }
  return String(e);
}

function statusAfterError(e: unknown, manual: boolean): PendingTicketStatus {
  if (isQuotaBlockedError(e)) return "quota_blocked";
  if (isPermanentUploadFailure(e)) return "failed";
  if (manual) return "pending";
  return "pending";
}

export async function flushPendingTickets(options: FlushOptions = {}): Promise<FlushResult> {
  const { manual = false, forceIds = [], maxItems = manual ? 1 : 0 } = options;
  const errors: string[] = [];
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;

  if (!manual && maxItems === 0) {
    return { uploaded: 0, failed: 0, skipped: 0, errors: [] };
  }

  const now = Date.now();
  const forceSet = new Set(forceIds);
  const rows = await getAllPendingTickets();

  const eligible = rows.filter((row) => {
    if (row.status === "uploading") return false;
    if (forceSet.has(row.id)) {
      return row.status === "pending" || row.status === "failed" || row.status === "quota_blocked";
    }
    if (row.status === "quota_blocked" || row.status === "failed") return false;
    if (row.status !== "pending") return false;
    if (row.nextRetryAt != null && row.nextRetryAt > now) return false;
    return true;
  });

  const limit = Math.max(1, maxItems);
  const toProcess = eligible.slice(0, limit);
  skipped = eligible.length - toProcess.length;

  for (const row of toProcess) {
    await updatePendingTicket(row.id, {
      status: "uploading",
      lastAttemptAt: now,
    }).catch(() => undefined);

    const file = new File([row.imageBuffer], `ticket-${row.id}.jpg`, {
      type: row.mimeType || "image/jpeg",
    });

    try {
      await uploadTicketFile(file, row.vehicleId, getOrCreateDeviceUid());
      await deletePendingTicket(row.id);
      uploaded += 1;
    } catch (e) {
      failed += 1;
      const msg = friendlyError(e);
      errors.push(`${row.id}: ${msg}`);
      const nextStatus = statusAfterError(e, manual);
      await updatePendingTicket(row.id, {
        status: nextStatus,
        lastError: msg,
        nextRetryAt:
          nextStatus === "pending" && !isQuotaBlockedError(e)
            ? now + RETRY_BACKOFF_MS
            : undefined,
      });
    }
  }

  return { uploaded, failed, skipped, errors };
}

export async function persistAndTryUpload(
  file: File,
  vehicleId: number,
  patente: string,
): Promise<{ mode: "synced" } | { mode: "queued"; navigatorOffline: boolean }> {
  const id = crypto.randomUUID();
  const imageBuffer = await file.arrayBuffer();

  const record: PendingTicketRecord = {
    id,
    vehicleId,
    patente,
    imageBuffer,
    mimeType: file.type || "image/jpeg",
    createdAt: Date.now(),
    status: "pending",
  };

  await putPendingTicket(record);

  try {
    await uploadTicketFile(file, vehicleId, getOrCreateDeviceUid());
    await deletePendingTicket(id);
    return { mode: "synced" };
  } catch (e) {
    if (isPermanentUploadFailure(e) && !isQuotaBlockedError(e)) {
      await deletePendingTicket(id);
      throw e;
    }
    const nextStatus: PendingTicketStatus = isQuotaBlockedError(e)
      ? "quota_blocked"
      : "pending";
    await updatePendingTicket(id, {
      status: nextStatus,
      lastError: friendlyError(e),
      nextRetryAt:
        nextStatus === "pending" ? Date.now() + RETRY_BACKOFF_MS : undefined,
    });
    const navigatorOffline =
      typeof navigator !== "undefined" && !navigator.onLine;
    return { mode: "queued", navigatorOffline };
  }
}

export async function retryPendingTicket(id: string): Promise<FlushResult> {
  return flushPendingTickets({ manual: true, forceIds: [id], maxItems: 1 });
}

export async function deleteInboxTicket(id: string): Promise<void> {
  await deletePendingTicket(id);
}
