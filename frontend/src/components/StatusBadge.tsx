import type { StepStatus } from "../types";
import { IconAlert, IconCheck, IconLoader } from "./icons";

const STYLES: Record<StepStatus, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-white/60 text-muted border-ink/10" },
  running: { label: "En cours", cls: "bg-teal/10 text-teal border-teal/30" },
  done: { label: "Terminé", cls: "bg-mint/10 text-mint border-mint/30" },
  error: { label: "Erreur", cls: "bg-flame/10 text-flame-soft border-flame/30" },
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
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/60 px-2.5 py-1 text-xs text-muted">État inconnu</span>;
  }
  const live = mode === "live";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${live ? "border-mint/30 bg-mint/10 text-mint" : "border-gold/30 bg-gold/10 text-gold-soft"}`}
      title={live ? "Worker GPU connecté" : "Worker GPU absent : solutions de repli légères"}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-mint" : "bg-gold"}`} />
      {live ? "Mode live" : "Mode démo"}
      {!compact && provider && <span className="font-normal text-muted">· LLM {provider}{model ? ` (${model})` : ""}</span>}
    </span>
  );
}
