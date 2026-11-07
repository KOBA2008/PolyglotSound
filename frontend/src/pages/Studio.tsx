import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import type { Project, StepName, StepStatus } from "../types";
import { STEP_ORDER, langLabel } from "../types";
import { ModeBadge } from "../components/StatusBadge";
import { IconArrowLeft, IconArrowRight, IconCheck, IconLoader, IconAlert } from "../components/icons";
import type { StepProps } from "./studio/shared";
import StepDeposit from "./studio/StepDeposit";
import StepSeparate from "./studio/StepSeparate";
import StepTranscribe from "./studio/StepTranscribe";
import StepAlign from "./studio/StepAlign";
import StepTranslate from "./studio/StepTranslate";
import StepSing from "./studio/StepSing";
import StepFinalize from "./studio/StepFinalize";

const WIZARD: { key: "deposit" | StepName; title: string; short: string }[] = [
  { key: "deposit", title: "Dépôt", short: "Morceau et consentement" },
  { key: "separate", title: "Séparation", short: "Voix et instrumentale" },
  { key: "transcribe", title: "Transcription", short: "Paroles et sens" },
  { key: "align", title: "Grille musicale", short: "Syllabes et temps forts" },
  { key: "translate", title: "Traduction", short: "Variantes qui se chantent" },
  { key: "sing", title: "Chant", short: "La voix de l'artiste" },
  { key: "finalize", title: "Final", short: "Mixage et filigrane" },
];

const POLL_MS = 1500;

export default function Studio() {
  const { id = "nouveau" } = useParams();
  const isNew = id === "nouveau";
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<StepName | null>(null);
  const [errors, setErrors] = useState<StepProps["errors"]>({});
  const pollTimer = useRef<number | undefined>(undefined);

  const statusOf = (i: number): StepStatus => {
    if (i === 0) return project ? "done" : "pending";
    return project?.steps?.[WIZARD[i].key as StepName]?.status ?? "pending";
  };

  // Chargement initial
  useEffect(() => {
    setProject(null);
    setLoadError(null);
    setErrors({});
    if (isNew) return;
    api.getProject(id).then(setProject).catch((e) => setLoadError(errMsg(e)));
  }, [id, isNew]);

  // Polling tant qu'une étape est en cours
  const anyRunning = !!project && STEP_ORDER.some((s) => project.steps?.[s]?.status === "running");
  useEffect(() => {
    if (!anyRunning || !project) return;
    let alive = true;
    const tick = async () => {
      try {
        const p = await api.getProject(project.id);
        if (alive) setProject(p);
      } catch {
        /* bannière gérée par api.ts ; on retente */
        if (alive) pollTimer.current = window.setTimeout(tick, POLL_MS * 2);
      }
    };
    pollTimer.current = window.setTimeout(tick, POLL_MS);
    return () => { alive = false; clearTimeout(pollTimer.current); };
  }, [anyRunning, project]);

  // Étape active : ?etape=N sinon la première non terminée
  const firstTodo = useMemo(() => {
    if (!project) return 0;
    const i = WIZARD.findIndex((_, k) => k > 0 && project.steps?.[WIZARD[k].key as StepName]?.status !== "done");
    return i === -1 ? WIZARD.length - 1 : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);
  const param = search.get("etape");
  const active = isNew ? 0 : Math.min(Math.max(param !== null ? Number(param) || 0 : firstTodo, 0), WIZARD.length - 1);
  const goTo = useCallback((i: number) => {
    setSearch({ etape: String(i) }, { replace: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setSearch]);

  const setError = useCallback((k: StepName | "save", msg: string | null) => {
    setErrors((e) => {
      const n = { ...e };
      if (msg) n[k] = msg; else delete n[k];
      return n;
    });
  }, []);

  const run = useCallback(async (step: StepName, body?: Record<string, unknown>) => {
    if (!project) return;
    setBusy(step);
    setError(step, null);
    try {
      const p = await api.runStep(project.id, step, body);
      setProject(p);
    } catch (e) {
      setError(step, errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [project, setError]);

  const rev = project ? STEP_ORDER.map((s) => project.steps?.[s]?.status?.[0] ?? "p").join("") : "";
  const fileUrl = useCallback((path: string | null | undefined) => {
    if (!path) return null;
    return `${path}${path.includes("?") ? "&" : "?"}v=${rev}`;
  }, [rev]);

  if (!isNew && loadError) {
    return (
      <div className="glass mx-auto mt-10 max-w-xl p-8 text-center" role="alert">
        <IconAlert size={28} className="mx-auto text-flame" />
        <h1 className="mt-3 font-display text-2xl font-extrabold">Projet introuvable</h1>
        <p className="mt-2 text-muted">{loadError}</p>
        <Link to="/" className="btn btn-primary mt-5">Retour à l'accueil</Link>
      </div>
    );
  }
  if (!isNew && !project) {
    return <div className="mt-16 flex items-center justify-center gap-3 text-muted"><IconLoader /> Chargement du projet...</div>;
  }

  const props: StepProps | null = project ? { project, setProject, run, busy, errors, setError, fileUrl, goTo } : null;
  const key = WIZARD[active].key;

  return (
    <div className="grid gap-6 pt-2 lg:grid-cols-[280px_1fr] xl:gap-8">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="glass p-4">
          {project ? (
            <div className="mb-4 border-b border-ink/10 pb-4">
              <div className="truncate font-display text-lg font-extrabold">{project.title}</div>
              <div className="truncate text-sm text-muted">{project.artist}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-ink/10 bg-white/70 px-2 py-0.5">{langLabel(project.source_lang)} → {langLabel(project.target_lang)}</span>
                <ModeBadge mode={project.mode} compact />
              </div>
            </div>
          ) : (
            <div className="mb-4 border-b border-ink/10 pb-4">
              <div className="font-display text-lg font-extrabold">Nouvelle adaptation</div>
              <div className="text-sm text-muted">Le parcours de l'artiste en 7 étapes</div>
            </div>
          )}
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Étapes">
            {WIZARD.map((w, i) => {
              const st = statusOf(i);
              const disabled = !project && i > 0;
              const current = i === active;
              return (
                <li key={w.key} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => goTo(i)}
                    aria-current={current ? "step" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${current ? "neo-chip ring-1 ring-brand/20" : "hover:bg-white/60"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      st === "done" ? "bg-mint text-white" : st === "running" ? "bg-teal/15 text-teal" : st === "error" ? "bg-flame text-white" : current ? "grad" : "neo-inset text-muted"}`}>
                      {st === "done" ? <IconCheck size={15} /> : st === "running" ? <IconLoader size={15} /> : st === "error" ? "!" : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap text-sm font-semibold">{w.title}</span>
                      <span className="hidden truncate text-xs text-muted lg:block">{w.short}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {project && (
            <div className="mt-4 hidden border-t border-ink/10 pt-4 lg:block">
              <div className="neo-well h-1.5 overflow-hidden">
                <div className="grad h-full rounded-full transition-all" style={{ width: `${(STEP_ORDER.filter((s) => project.steps?.[s]?.status === "done").length / STEP_ORDER.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        {key === "deposit" && <StepDeposit project={project} onCreated={(p) => navigate(`/projet/${p.id}?etape=1`)} fileUrl={props?.fileUrl ?? ((x) => x ?? null)} />}
        {props && key === "separate" && <StepSeparate {...props} />}
        {props && key === "transcribe" && <StepTranscribe {...props} />}
        {props && key === "align" && <StepAlign {...props} />}
        {props && key === "translate" && <StepTranslate {...props} />}
        {props && key === "sing" && <StepSing {...props} />}
        {props && key === "finalize" && <StepFinalize {...props} />}

        {project && (
          <nav className="flex items-center justify-between gap-3" aria-label="Navigation entre étapes">
            <button type="button" className="btn btn-ghost" disabled={active === 0} onClick={() => goTo(active - 1)}>
              <IconArrowLeft size={16} /> {active > 0 ? WIZARD[active - 1].title : "Précédent"}
            </button>
            {active < WIZARD.length - 1 && (
              <button type="button" className="btn btn-ghost" onClick={() => goTo(active + 1)}>
                {WIZARD[active + 1].title} <IconArrowRight size={16} />
              </button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
