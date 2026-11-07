import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../api";
import type { Project } from "../types";
import { STEP_ORDER, langLabel } from "../types";
import Wave from "../components/Wave";
import { IconArrowRight, IconCheck, IconMusic, IconPlay, IconShield, IconTrash } from "../components/icons";

const TEMPS = [
  { n: "01", title: "Comprendre", text: "Séparation de la voix et de l'instrumentale, transcription du yorùbá, du fon ou du swahili, sens en français. L'artiste corrige chaque ligne.", color: "from-brand to-teal", tag: "Yorùbá en priorité" },
  { n: "02", title: "Adapter", text: "Traduction qui se chante : même nombre de syllabes par ligne, accents sur les temps forts, plusieurs variantes au choix.", color: "from-brand to-gold", tag: "Syllabes et accents" },
  { n: "03", title: "Chanter et protéger", text: "La voix de l'artiste interprète la nouvelle version sur l'instrumentale d'origine, signée par un filigrane AudioSeal.", color: "from-gold to-flame", tag: "Voix et filigrane" },
];

const MOCK_TRACKS = [
  { label: "Voix isolée", time: "0:24", bar: "bg-brand", width: "68%" },
  { label: "Instrumentale", time: "0:24", bar: "bg-gold", width: "86%" },
  { label: "Version anglaise", time: "0:24", bar: "bg-flame", width: "52%" },
];

function progressOf(p: Project) {
  const done = STEP_ORDER.filter((s) => p.steps?.[s]?.status === "done").length;
  return { done, total: STEP_ORDER.length };
}

export default function Home() {
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
      <section className="relative grid items-center gap-10 pt-6 md:pt-14 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <img
            src="/logopolyglot.png"
            alt="Logo PolyglotSound"
            width={72}
            height={72}
            className="h-16 w-16 rounded-2xl object-cover shadow-[var(--raise-sm)] ring-1 ring-white/50 md:h-[72px] md:w-[72px]"
          />
          <p className="kicker mt-7">Hackathon IA &amp; Musique 2026 · SIMA × Epitech Bénin</p>
          <h1 className="mt-4 max-w-[16ch] font-serif text-5xl italic leading-[1.02] tracking-tight md:text-7xl">
            La même chanson, un autre monde.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">
            Transcende les langues, conserve l'âme : la musique béninoise et africaine sans frontières. Une chanson en <strong className="font-semibold text-gold-soft">yorùbá</strong>, chantée en anglais ou en français, avec la voix de son artiste et sur l'instrumentale d'origine.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/projet/nouveau" className="btn btn-primary px-6 py-3 text-base">
              Démarrer une adaptation <IconArrowRight size={18} />
            </Link>
            <Link to="/atelier" className="btn btn-ghost px-6 py-3 text-base">Atelier jury</Link>
          </div>
          <p className="mt-6 text-sm text-muted">
            Langues prises en charge : yorùbá en priorité, fon, swahili.
          </p>
        </div>

        <div className="glass relative overflow-hidden p-6 md:p-7">
          <svg className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 opacity-40" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(0,208,132,.34)" strokeWidth="1" />
            <circle cx="100" cy="100" r="54" fill="none" stroke="rgba(255,215,0,.34)" strokeWidth="1" />
            <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(255,30,30,.26)" strokeWidth="1" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => {
              const a = (d * Math.PI) / 180;
              return <circle key={d} cx={100 + 78 * Math.cos(a)} cy={100 + 78 * Math.sin(a)} r="2.4" fill={d % 90 === 0 ? "#ffd700" : "#00d084"} />;
            })}
          </svg>
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Aperçu du studio</p>
            <p className="mt-1 font-display text-xl font-extrabold">Yorùbá <span className="text-muted">→</span> Anglais</p>
            <div className="neo-inset mt-5 rounded-2xl p-4">
              <Wave bars={36} height={90} className="justify-between" />
              <div className="mt-5 space-y-3" aria-hidden="true">
                {MOCK_TRACKS.map((t) => (
                  <div key={t.label} className="flex items-center gap-2.5">
                    <span className="neo-chip flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink">
                      <IconPlay size={10} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-semibold">{t.label}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">{t.time}</span>
                      </div>
                      <div className="neo-well mt-1.5 h-1.5 w-full">
                        <div className={`h-full rounded-full ${t.bar}`} style={{ width: t.width }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <IconShield size={13} className="text-brand-soft" /> Chaque version est signée par un filigrane AudioSeal.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="temps">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="temps" className="font-display text-3xl font-extrabold tracking-tight">En trois temps</h2>
          <p className="text-sm text-muted">Un parcours guidé, validé par l'artiste à chaque étape.</p>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {TEMPS.map((t) => (
            <div key={t.n} className="glass group p-6 transition duration-200 hover:-translate-y-1">
              <div className="flex items-start justify-between gap-3">
                <span className={`bg-gradient-to-r ${t.color} bg-clip-text font-display text-4xl font-extrabold text-transparent`}>{t.n}</span>
                <span className="flex items-center gap-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${t.color}`} aria-hidden="true" />
                  {t.tag}
                </span>
              </div>
              <h3 className="mt-3 font-display text-xl font-extrabold">{t.title}</h3>
              <p className="mt-2 text-muted">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="projets">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="projets" className="font-display text-3xl font-extrabold tracking-tight">Projets</h2>
            {projects && <span className="text-sm text-muted">{projects.length} projet{projects.length > 1 ? "s" : ""}</span>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>Actualiser</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-flame/30 bg-flame/8 p-3 text-sm text-flame-soft">{error}</p>}
        {projects === null && !error && (
          <>
            <p className="sr-only" role="status">Chargement des projets...</p>
            <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="glass p-5">
                  <div className="neo-inset h-10 w-10 rounded-xl" />
                  <div className="neo-inset mt-4 h-4 w-1/2 rounded-md" />
                  <div className="neo-inset mt-2 h-3 w-2/3 rounded-md" />
                  <div className="neo-well mt-5 h-1.5 w-full" />
                </li>
              ))}
            </ul>
          </>
        )}
        {projects && projects.length === 0 && (
          <div className="glass mt-6 flex flex-col items-center gap-3 p-10 text-center">
            <span className="grad flex h-12 w-12 items-center justify-center rounded-2xl"><IconMusic size={22} /></span>
            <p className="font-display text-lg font-extrabold">Aucun projet pour l'instant</p>
            <p className="max-w-md text-muted">Déposez un premier refrain, en yorùbá de préférence, pour lancer la démonstration.</p>
            <Link to="/projet/nouveau" className="btn btn-primary mt-1 px-5">Démarrer une adaptation</Link>
          </div>
        )}
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects?.map((p) => {
            const { done, total } = progressOf(p);
            const finished = !!p.files?.final;
            return (
              <li key={p.id} className="glass group relative p-5 transition duration-200 hover:-translate-y-0.5">
                <Link to={`/projet/${p.id}`} className="block after:absolute after:inset-0 after:content-['']">
                  <div className="flex items-start gap-3">
                    <span className="grad flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><IconMusic size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-display text-lg font-bold">{p.title || "Sans titre"}</div>
                        {finished && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-soft">
                            <IconCheck size={11} /> Terminé
                          </span>
                        )}
                      </div>
                      <div className="truncate text-sm text-muted">{p.artist} · {langLabel(p.source_lang)} → {langLabel(p.target_lang)}</div>
                    </div>
                  </div>
                </Link>
                <div className="mt-4 flex items-center gap-3">
                  <div className="neo-well h-1.5 flex-1 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-gold" style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted">{done}/{total} étapes</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">{finished ? "Version finale signée" : "En cours d'adaptation"}</span>
                  <div className="flex items-center gap-1.5">
                    {finished && (
                      <Link
                        to={`/projet/${p.id}?etape=6`}
                        className="btn btn-ghost btn-sm relative z-10 whitespace-nowrap"
                        aria-label={`Écouter le résultat de ${p.title}`}
                      >
                        <IconPlay size={12} /> Écouter le résultat
                      </Link>
                    )}
                    <button type="button" onClick={() => void remove(p)} className="relative z-10 rounded-full p-1.5 text-muted transition hover:bg-flame/10 hover:text-flame-soft" aria-label={`Supprimer ${p.title}`}>
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
