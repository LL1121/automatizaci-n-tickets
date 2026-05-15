/** Política de reintentos: evitar quemar tokens de Gemini en bucles. */

/** Reintento automático deshabilitado; solo subida manual desde Pendientes. */
export const AUTO_SYNC_ENABLED = false;

/** Mínimo entre intentos automáticos (si AUTO_SYNC_ENABLED). */
export const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

/** Tras error transitorio (red/5xx), esperar antes de permitir otro intento. */
export const RETRY_BACKOFF_MS = 10 * 60 * 1000;

/** HTTP 429 / cuota IA: no reintentar hasta acción manual explícita. */
export const QUOTA_BLOCKED_STATUSES = new Set([429, 402, 403]);
