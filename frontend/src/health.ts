import { useEffect, useState } from "react";
import { api } from "./api";
import type { Health } from "./types";

/** Interroge /api/health régulièrement (sert aussi à détecter le retour du backend). */
export function useHealth(intervalMs = 10000) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: number;
    const tick = async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
      } catch {
        if (alive) setHealth(null);
      }
      if (alive) timer = window.setTimeout(tick, intervalMs);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [intervalMs]);
  return health;
}
