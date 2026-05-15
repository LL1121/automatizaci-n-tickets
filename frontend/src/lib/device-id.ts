const STORAGE_KEY = "fuelops-device-uid";

/**
 * Identificador persistente del navegador/PWA.
 * No es IMEI/MAC real (el navegador no lo expone); sirve para vincular operario ↔ celular.
 */
export function getOrCreateDeviceUid(): string {
  if (typeof window === "undefined") return "ssr-placeholder";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
