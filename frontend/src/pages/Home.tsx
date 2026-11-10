import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg, isOffline } from "../api";
import { useOffline } from "../health";
import type { Project } from "../types";
import { STEP_ORDER, langLabel } from "../types";
import Wave from "../components/Wave";
import { IconArrowRight, IconCheck, IconMusic, IconPlay, IconShield, IconTrash } from "../components/icons";

const TEMPS = [
  { n: "01", title: "Comprendre", items: ["Voix isolée", "Paroles", "Sens"], color: "from-brand to-teal", photo: "/photos/card-comprendre.jpg", alt: "Séance d'enregistrement en studio" },
  { n: "02", title: "Adapter", items: ["Syllabes", "Accents", "Variantes"], color: "from-brand to-gold", photo: "/photos/card-adapter.jpg", alt: "Partition et batterie dans un studio" },
  { n: "03", title: "Chanter et protéger", items: ["Voix d'origine", "Instrumentale", "Filigrane"], color: "from-gold to-flame", photo: "/photos/card-chanter.jpg", alt: "Musicien traditionnel sur scène" },
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
  const offline = useOffline();

  const load = async () => {
    try {
      const list = await api.listProjects();
      // Hors ligne : ordre choisi à l'export (projet phare en premier)
      setProjects(isOffline() ? list : [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")));
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
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl">
            La voix de l'artiste. L'instrumentale d'origine. <strong className="font-semibold text-gold-soft">Une autre langue.</strong>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/projet/nouveau" className="btn btn-primary px-6 py-3 text-base">
              Démarrer une adaptation <IconArrowRight size={18} />
            </Link>
            <Link to="/atelier" className="btn btn-ghost px-6 py-3 text-base">Atelier jury</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="rounded-[9px] px-2.5 py-1 text-gold-soft shadow-[var(--inset-sm)]">Yorùbá en priorité</span>
            <span className="rounded-[9px] px-2.5 py-1 text-muted shadow-[var(--inset-sm)]">Fon</span>
            <span className="rounded-[9px] px-2.5 py-1 text-muted shadow-[var(--inset-sm)]">Swahili</span>
          </div>
        </div>

        <div className="glass overflow-hidden">
          <div className="relative h-64 md:h-72">
            <img
              src="/photos/hero-singer.jpg"
              alt="Chanteuse sur scène dans une lumière colorée"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
            <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white md:inset-x-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Aperçu du studio</p>
                <p className="mt-1 font-display text-2xl font-extrabold">Yorùbá <span className="text-white/50">→</span> Anglais</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-ink backdrop-blur">
                <IconShield size={11} className="text-brand-soft" /> AudioSeal
              </span>
            </div>
          </div>
          <div className="p-4 md:p-5">
            <Wave bars={30} height={54} className="justify-between" />
            <div className="mt-4 space-y-2.5" aria-hidden="true">
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
        </div>
      </section>

      <section aria-labelledby="temps">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="temps" className="font-display text-3xl font-extrabold tracking-tight">Trois temps</h2>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {TEMPS.map((t) => (
            <div key={t.n} className="glass group overflow-hidden transition duration-200 hover:-translate-y-1">
              <div className="h-40 overflow-hidden">
                <img
                  src={t.photo}
                  alt={t.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-5 md:p-6">
                <div className="flex items-baseline gap-3">
                  <span className={`bg-gradient-to-r ${t.color} bg-clip-text font-display text-3xl font-extrabold text-transparent`}>{t.n}</span>
                  <h3 className="font-display text-xl font-extrabold">{t.title}</h3>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {t.items.map((it) => (
                    <li key={it} className="rounded-full px-2.5 py-1 text-xs font-semibold text-muted shadow-[var(--inset-sm)]">{it}</li>
                  ))}
                </ul>
              </div>
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
            <p className="max-w-md text-muted">Déposez un refrain pour lancer la démo.</p>
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
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <div className="flex items-center gap-1.5">
                    {finished && (
                      <Link
                        to={`/projet/${p.id}?etape=6`}
                        className="btn btn-ghost btn-sm relative z-10 whitespace-nowrap"
                        aria-label={`Écouter le résultat de ${p.title}`}
                      >
                        <IconPlay size={12} /> Écouter
                      </Link>
                    )}
                    {!offline && <button type="button" onClick={() => void remove(p)} className="relative z-10 rounded-full p-1.5 text-muted transition hover:bg-flame/10 hover:text-flame-soft" aria-label={`Supprimer ${p.title}`}>
                      <IconTrash size={15} />
                    </button>}
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
