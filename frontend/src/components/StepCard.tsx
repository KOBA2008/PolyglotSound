import type { ReactNode } from "react";
import type { StepState } from "../types";
import StatusBadge from "./StatusBadge";
import { useOffline } from "../health";
import { IconAlert, IconPlay, IconRefresh } from "./icons";

interface Props {
  number: number;
  title: string;
  subtitle?: string;
  state?: StepState;
  onRun?: () => void;
  runLabel?: string;
  runDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  extraActions?: ReactNode;
  children?: ReactNode;
}

/** Cadre commun d'une étape du studio : titre, état, progression, lancement et relance. */
export default function StepCard({ number, title, subtitle, state, onRun, runLabel = "Lancer", runDisabled, busy, error, extraActions, children }: Props) {
  const offline = useOffline();
  const running = state?.status === "running";
  const done = state?.status === "done";
  const failed = state?.status === "error";
  return (
    <section className="glass fade-in p-5 md:p-7" aria-labelledby={`step-${number}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grad flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold">{number}</span>
          <div>
            <h2 id={`step-${number}`} className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h2>
            {subtitle && <p className="mt-1 max-w-2xl text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state && <StatusBadge status={state.status} />}
          {extraActions}
          {onRun && (
            <button type="button" className={done || failed ? "btn btn-ghost" : "btn btn-primary"} onClick={onRun} disabled={offline || runDisabled || running || busy}
              title={offline ? "Indisponible en mode démo hors ligne" : undefined}>
              {done || failed ? <IconRefresh size={16} /> : <IconPlay size={16} />}
              {running ? "En cours..." : done || failed ? "Relancer" : runLabel}
            </button>
          )}
        </div>
      </header>

      {running && (
        <div className="mt-5" aria-live="polite">
          <div className="neo-well h-2 overflow-hidden">
            <div
              className="pulse-bar h-full rounded-full transition-all"
              style={{
                width: `${Math.max(state!.progress || 0, 8)}%`,
                backgroundImage: "linear-gradient(90deg,#00d084,#ffd700,#ff1e1e,#00d084)",
              }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">{state!.message || "Traitement en cours..."}{state!.progress ? ` (${Math.round(state!.progress)} %)` : ""}</p>
        </div>
      )}
      {done && state?.message && (
        <p className="mt-4 line-clamp-1 text-sm text-muted" aria-live="polite" title={state.message}>{state.message}</p>
      )}
      {(failed || error) && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-flame/30 bg-flame/8 p-3 text-sm text-flame-soft">
          <IconAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{failed ? "L'étape a échoué" : "Erreur"}</div>
            <div>{error || state?.message || "Erreur inconnue."}</div>
            {failed && onRun && <div className="mt-1 text-flame-soft">Vous pouvez corriger puis relancer l'étape.</div>}
          </div>
        </div>
      )}
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
