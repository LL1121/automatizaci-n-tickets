import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";

export type PendingTicketStatus =
  | "pending"
  | "uploading"
  | "failed"
  | "quota_blocked";

export interface PendingTicketRecord {
  id: string;
  vehicleId: number;
  patente: string;
  imageBuffer: ArrayBuffer;
  mimeType: string;
  createdAt: number;
  status: PendingTicketStatus;
  lastError?: string;
  /** No reintentar antes de este timestamp (ms). */
  nextRetryAt?: number;
  lastAttemptAt?: number;
}

interface FuelOpsDB extends DBSchema {
  "pending-tickets": {
    key: string;
    value: PendingTicketRecord;
    indexes: { "by-created": number };
  };
}

const DB_NAME = "fuelops-field";
const DB_VERSION = 2;

export async function openOfflineDB(): Promise<IDBPDatabase<FuelOpsDB>> {
  return openDB<FuelOpsDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains("pending-tickets")) {
        const store = db.createObjectStore("pending-tickets", { keyPath: "id" });
        store.createIndex("by-created", "createdAt");
      } else if (oldVersion < 2) {
        // v2: patente, nextRetryAt, lastAttemptAt — valores opcionales en registros viejos
      }
    },
  });
}

export async function putPendingTicket(record: PendingTicketRecord): Promise<void> {
  const db = await openOfflineDB();
  await db.put("pending-tickets", record);
}

export async function deletePendingTicket(id: string): Promise<void> {
  const db = await openOfflineDB();
  await db.delete("pending-tickets", id);
}

export async function getPendingTicket(id: string): Promise<PendingTicketRecord | undefined> {
  const db = await openOfflineDB();
  return db.get("pending-tickets", id);
}

export async function updatePendingTicket(
  id: string,
  patch: Partial<
    Pick<PendingTicketRecord, "status" | "lastError" | "nextRetryAt" | "lastAttemptAt" | "patente">
  >,
): Promise<void> {
  const db = await openOfflineDB();
  const prev = await db.get("pending-tickets", id);
  if (!prev) return;
  await db.put("pending-tickets", { ...prev, ...patch });
}

export async function getAllPendingTickets(): Promise<PendingTicketRecord[]> {
  const db = await openOfflineDB();
  const rows = await db.getAll("pending-tickets");
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Tickets visibles en la bandeja (excluye solo los ya subidos — no hay; se borran al subir). */
export async function listInboxTickets(): Promise<PendingTicketRecord[]> {
  return getAllPendingTickets();
}

export async function countPendingTickets(): Promise<number> {
  const rows = await getAllPendingTickets();
  return rows.filter((r) => r.status === "pending" || r.status === "uploading").length;
}

export async function countInboxTickets(): Promise<number> {
  const rows = await getAllPendingTickets();
  return rows.length;
}
