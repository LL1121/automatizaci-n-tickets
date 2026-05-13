import { uploadTicketFile, isPermanentUploadFailure, UploadHttpError } from "@/lib/upload-ticket";
import {
  deletePendingTicket,
  getAllPendingTickets,
  putPendingTicket,
  updatePendingTicket,
  type PendingTicketRecord,
} from "@/lib/offline-db";

export type FlushResult = {
  uploaded: number;
  failed: number;
  errors: string[];
};

export async function flushPendingTickets(): Promise<FlushResult> {
  const errors: string[] = [];
  let uploaded = 0;
  let failed = 0;

  const rows = (await getAllPendingTickets()).filter((r) => r.status === "pending");

  for (const row of rows) {
    await updatePendingTicket(row.id, { status: "uploading" }).catch(() => undefined);
    const file = new File([row.imageBuffer], `ticket-${row.id}.jpg`, {
      type: row.mimeType || "image/jpeg",
    });
    try {
      await uploadTicketFile(file, row.vehicleId);
      await deletePendingTicket(row.id);
      uploaded += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof UploadHttpError ? `${e.status}: ${e.message}` : String(e);
      errors.push(`${row.id}: ${msg}`);
      if (isPermanentUploadFailure(e)) {
        await updatePendingTicket(row.id, { status: "failed", lastError: msg });
      } else {
        await updatePendingTicket(row.id, { status: "pending", lastError: msg });
      }
    }
  }

  return { uploaded, failed, errors };
}

export async function persistAndTryUpload(
  file: File,
  vehicleId: number,
): Promise<{ mode: "synced" } | { mode: "queued"; navigatorOffline: boolean }> {
  const id = crypto.randomUUID();
  const imageBuffer = await file.arrayBuffer();

  const record: PendingTicketRecord = {
    id,
    vehicleId,
    imageBuffer,
    mimeType: file.type || "image/jpeg",
    createdAt: Date.now(),
    status: "pending",
  };

  await putPendingTicket(record);

  try {
    await uploadTicketFile(file, vehicleId);
    await deletePendingTicket(id);
    return { mode: "synced" };
  } catch (e) {
    if (isPermanentUploadFailure(e)) {
      await deletePendingTicket(id);
      throw e;
    }
    await updatePendingTicket(id, { status: "pending", lastError: String(e) });
    const navigatorOffline =
      typeof navigator !== "undefined" && !navigator.onLine;
    return { mode: "queued", navigatorOffline };
  }
}
