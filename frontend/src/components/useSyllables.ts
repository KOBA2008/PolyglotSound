import { useEffect, useState } from "react";
import { api } from "../api";

/** Compte de syllabes en direct via POST /api/syllables, avec anti-rebond. */
export function useSyllables(text: string, lang: string, delay = 350) {
  const [res, setRes] = useState<{ count: number; split: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const t = text.trim();
    if (!t) { setRes({ count: 0, split: [] }); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await api.syllables(t, lang, ctrl.signal);
        setRes(r);
        setError(false);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, delay);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [text, lang, delay]);
  return { count: res?.count ?? null, split: res?.split ?? [], loading, error };
}
