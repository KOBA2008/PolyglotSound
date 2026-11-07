import type { StepStatus } from "../types";
import { IconAlert, IconCheck, IconLoader } from "./icons";

const STYLES: Record<StepStatus, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "text-muted" },
  running: { label: "En cours", cls: "text-teal" },
  done: { label: "Terminé", cls: "text-mint" },
  error: { label: "Erreur", cls: "text-flame-soft" },
};

export default function StatusBadge({ status, label }: { status: StepStatus; label?: string }) {
  const s = STYLES[status] ?? STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-semibold shadow-[var(--inset-sm)] ${s.cls}`}>
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
    return <span className="inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs text-muted shadow-[var(--inset-sm)]">État inconnu</span>;
  }
  const live = mode === "live";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[9px] px-3 py-1 text-xs font-semibold shadow-[var(--inset-sm)] ${live ? "text-mint" : "text-gold-soft"}`}
      title={live ? "Worker GPU connecté" : "Worker GPU absent : solutions de repli légères"}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-mint" : "bg-gold"}`} />
      {live ? "Mode live" : "Mode démo"}
      {!compact && provider && <span className="font-normal text-muted">· LLM {provider}{model ? ` (${model})` : ""}</span>}
    </span>
  );
}
