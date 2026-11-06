import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, errMsg } from "../api";
import type { LayoutCtx } from "../App";
import type { Project } from "../types";
import { STEP_ORDER, langLabel } from "../types";
import Wave from "../components/Wave";
import { ModeBadge } from "../components/StatusBadge";
import { IconArrowRight, IconMusic, IconTrash } from "../components/icons";

const TEMPS = [
  { n: "01", title: "Comprendre", text: "Séparation de la voix et de l'instrumentale, transcription du fon ou du yorùbá, sens en français. L'artiste corrige chaque ligne.", color: "from-violet to-cyan" },
  { n: "02", title: "Adapter", text: "Traduction qui se chante : même nombre de syllabes par ligne, accents sur les temps forts, plusieurs variantes au choix.", color: "from-violet to-magenta" },
  { n: "03", title: "Chanter et protéger", text: "La voix de l'artiste interprète la nouvelle version sur l'instrumentale d'origine, signée par un filigrane AudioSeal.", color: "from-magenta to-orange" },
];

function progressOf(p: Project) {
  const done = STEP_ORDER.filter((s) => p.steps?.[s]?.status === "done").length;
  return { done, total: STEP_ORDER.length };
}

export default function Home() {
  const { health } = useOutletContext<LayoutCtx>();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await api.listProjects();
      setProjects([...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => { void load(); }, []);

  const remove = async (p: Project) => {
    if (!confirm(`Supprimer le projet « ${p.title} » ?`)) return;
    try { await api.deleteProject(p.id); await load(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="space-y-16">
      <section className="relative grid items-center gap-10 pt-6 md:pt-14 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="kicker">Hackathon IA &amp; Musique 2026 · SIMA × Epitech Bénin</p>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl xl:text-8xl">
            Polyglot<span className="grad-text">Sound</span>
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-[#f3e8ff] md:text-2xl">
            Transcende les langues, conserve l'âme : la musique béninoise et africaine sans frontières.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/projet/nouveau" className="btn btn-primary px-6 py-3 text-base">
              Démarrer une adaptation <IconArrowRight size={18} />
            </Link>
            <Link to="/atelier" className="btn btn-ghost px-6 py-3 text-base">Atelier jury</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <ModeBadge mode={health?.mode} provider={health?.llm?.provider} model={health?.llm?.model} />
            {health && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted">
                Worker GPU : {health.worker ? "connecté" : "absent"}
              </span>
            )}
          </div>
        </div>
        <div className="glass relative overflow-hidden p-6 md:p-8">
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            {["Fon", "Yorùbá", "Français", "Anglais"].map((l) => (
              <span key={l} className="rounded-full border border-white/20 bg-white/5 px-3 py-1">{l}</span>
            ))}
          </div>
          <Wave bars={36} height={90} className="justify-between" />
          <p className="mt-5 font-display text-lg font-bold leading-snug">
            Une chanson en fon, chantée en anglais par la voix de son artiste, sur le même groove.
          </p>
          <p className="mt-2 text-sm text-muted">L'artiste valide chaque étape et chaque version est signée numériquement.</p>
        </div>
      </section>

      <section aria-labelledby="temps">
        <h2 id="temps" className="font-display text-3xl font-extrabold tracking-tight">En trois temps</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {TEMPS.map((t) => (
            <div key={t.n} className="glass p-6">
              <span className={`font-display text-4xl font-extrabold bg-gradient-to-r ${t.color} bg-clip-text text-transparent`}>{t.n}</span>
              <h3 className="mt-2 font-display text-xl font-extrabold">{t.title}</h3>
              <p className="mt-2 text-muted">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="projets">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="projets" className="font-display text-3xl font-extrabold tracking-tight">Projets</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>Actualiser</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {projects && projects.length === 0 && (
          <div className="glass mt-6 p-8 text-center text-muted">
            Aucun projet pour l'instant. <Link to="/projet/nouveau" className="font-semibold text-pink-300 underline">Déposez un premier refrain</Link>.
          </div>
        )}
        {projects === null && !error && <p className="mt-6 text-muted">Chargement...</p>}
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects?.map((p) => {
            const { done, total } = progressOf(p);
            return (
              <li key={p.id} className="glass group relative p-5 transition hover:bg-white/8">
                <Link to={`/projet/${p.id}`} className="block after:absolute after:inset-0 after:content-['']">
                  <div className="flex items-start gap-3">
                    <span className="grad flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><IconMusic size={18} /></span>
                    <div className="min-w-0">
                      <div className="truncate font-display text-lg font-bold">{p.title || "Sans titre"}</div>
                      <div className="truncate text-sm text-muted">{p.artist} · {langLabel(p.source_lang)} → {langLabel(p.target_lang)}</div>
                    </div>
                  </div>
                </Link>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="grad h-full rounded-full" style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted">{done}/{total} étapes</span>
                  <button type="button" onClick={() => void remove(p)} className="relative z-10 rounded-full p-1.5 text-muted hover:bg-red-500/20 hover:text-red-300" aria-label={`Supprimer ${p.title}`}>
                    <IconTrash size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
