"use client";

import { useEffect, useRef } from "react";
import { AUTO_SYNC_COOLDOWN_MS, AUTO_SYNC_ENABLED } from "@/lib/sync-policy";
import { flushPendingTickets, type FlushResult } from "@/lib/sync-queue";

/**
 * Sincronización automática desactivada por defecto (control de tokens Gemini).
 * Si AUTO_SYNC_ENABLED, como máximo 1 ticket por cooldown al volver online.
 */
export function useOfflineSync(onFlush?: (result: FlushResult) => void) {
  const busy = useRef(false);
  const lastRun = useRef(0);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  useEffect(() => {
    if (!AUTO_SYNC_ENABLED) return;

    const run = async () => {
      if (busy.current || typeof navigator === "undefined" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRun.current < AUTO_SYNC_COOLDOWN_MS) return;
      busy.current = true;
      try {
        const result = await flushPendingTickets({ manual: false, maxItems: 1 });
        if (result.uploaded > 0 || result.failed > 0) {
          lastRun.current = now;
        }
        onFlushRef.current?.(result);
      } finally {
        busy.current = false;
      }
    };

    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
