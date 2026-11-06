import type { StepStatus } from "../types";
import { IconAlert, IconCheck, IconLoader } from "./icons";

const STYLES: Record<StepStatus, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-white/8 text-muted border-white/15" },
  running: { label: "En cours", cls: "bg-cyan/15 text-cyan-200 border-cyan/40" },
  done: { label: "Terminé", cls: "bg-lime/15 text-lime border-lime/40" },
  error: { label: "Erreur", cls: "bg-red-500/15 text-red-300 border-red-400/40" },
};

export default function StatusBadge({ status, label }: { status: StepStatus; label?: string }) {
  const s = STYLES[status] ?? STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {status === "running" && <IconLoader size={12} />}
      {status === "done" && <IconCheck size={12} />}
      {status === "error" && <IconAlert size={12} />}
      {label ?? s.label}
    </span>
  );
}

/** Pastille mode démo / live + fournisseur LLM. */
export function ModeBadge({ mode, provider, model, compact }: { mode?: string; provider?: string; model?: string | null; compact?: boolean }) {
  if (!mode) {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-muted">État inconnu</span>;
  }
  const live = mode === "live";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${live ? "border-lime/50 bg-lime/10 text-lime" : "border-orange/50 bg-orange/10 text-orange-300"}`}
      title={live ? "Worker GPU connecté" : "Worker GPU absent : solutions de repli légères"}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-lime" : "bg-orange"}`} />
      {live ? "Mode live" : "Mode démo"}
      {!compact && provider && <span className="font-normal text-muted">· LLM {provider}{model ? ` (${model})` : ""}</span>}
    </span>
  );
}
