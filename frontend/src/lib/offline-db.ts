import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";

export type PendingTicketStatus = "pending" | "uploading" | "failed";

export interface PendingTicketRecord {
  id: string;
  vehicleId: number;
  imageBuffer: ArrayBuffer;
  mimeType: string;
  createdAt: number;
  status: PendingTicketStatus;
  lastError?: string;
}

interface FuelOpsDB extends DBSchema {
  "pending-tickets": {
    key: string;
    value: PendingTicketRecord;
    indexes: { "by-created": number };
  };
}

const DB_NAME = "fuelops-field";
const DB_VERSION = 1;

export async function openOfflineDB(): Promise<IDBPDatabase<FuelOpsDB>> {
  return openDB<FuelOpsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending-tickets")) {
        const store = db.createObjectStore("pending-tickets", { keyPath: "id" });
        store.createIndex("by-created", "createdAt");
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

export async function updatePendingTicket(
  id: string,
  patch: Partial<Pick<PendingTicketRecord, "status" | "lastError">>,
): Promise<void> {
  const db = await openOfflineDB();
  const prev = await db.get("pending-tickets", id);
  if (!prev) return;
  await db.put("pending-tickets", { ...prev, ...patch });
}

export async function getAllPendingTickets(): Promise<PendingTicketRecord[]> {
  const db = await openOfflineDB();
  return db.getAll("pending-tickets");
}

export async function countPendingTickets(): Promise<number> {
  const db = await openOfflineDB();
  return db.count("pending-tickets");
}
