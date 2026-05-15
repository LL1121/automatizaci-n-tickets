import { getApiBase } from "@/lib/api";

export type OperatorProfile = {
  id: number;
  device_uid: string;
  nombre: string;
  created_at: string | null;
  last_seen_at: string | null;
};

export async function fetchOperatorByDevice(deviceUid: string): Promise<OperatorProfile | null> {
  const res = await fetch(`${getApiBase()}/operators/device/${encodeURIComponent(deviceUid)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`operators ${res.status}`);
  return res.json() as Promise<OperatorProfile>;
}

export async function registerOperator(deviceUid: string, nombre: string): Promise<OperatorProfile> {
  const res = await fetch(`${getApiBase()}/operators/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_uid: deviceUid, nombre: nombre.trim() }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `register ${res.status}`);
  }
  return res.json() as Promise<OperatorProfile>;
}
