"use client";

import { useEffect, useRef } from "react";
import { flushPendingTickets } from "@/lib/sync-queue";

export function useOfflineSync(onFlush?: (result: Awaited<ReturnType<typeof flushPendingTickets>>) => void) {
  const busy = useRef(false);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  useEffect(() => {
    const run = async () => {
      if (busy.current || typeof navigator === "undefined" || !navigator.onLine) return;
      busy.current = true;
      try {
        const result = await flushPendingTickets();
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
