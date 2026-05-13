function normalizeEnvUrl(value: string): string {
  let base = value.trim().replace(/\/$/, "");
  if (
    (base.startsWith('"') && base.endsWith('"')) ||
    (base.startsWith("'") && base.endsWith("'"))
  ) {
    base = base.slice(1, -1).trim().replace(/\/$/, "");
  }
  return base;
}

const rawFromEnv = normalizeEnvUrl(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
);

/** http:// con hostname público (TLS en el borde); excluye Docker/local. */
function looksLikePublicHttpBehindTls(base: string): boolean {
  try {
    const u = new URL(base);
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
    if (h === "api" || h === "db" || h === "frontend" || h === "web") return false;
    return h.includes(".");
  } catch {
    return false;
  }
}

/**
 * Base URL del API. Usar en cada `fetch` / URL generada para que en HTTPS
 * no quede embebido `http://` de un build viejo (contenido mixto).
 */
export function getApiBase(): string {
  let base = rawFromEnv;
  const isBrowser = typeof window !== "undefined";
  const browserOnHttps = isBrowser && window.location.protocol === "https:";
  const serverPublicHttp = !isBrowser && looksLikePublicHttpBehindTls(base);
  if ((browserOnHttps || serverPublicHttp) && /^http:\/\//i.test(base)) {
    base = base.replace(/^http:\/\//i, "https://");
  }
  return base;
}
