import { useEffect, useMemo, useState } from "react";
import { api, errMsg } from "../../api";
import type { StepProps } from "./shared";
import { fmtSec } from "./shared";
import StepCard from "../../components/StepCard";
import { useSegmentPlayer } from "../../components/useSegmentPlayer";
import { useSyllables } from "../../components/useSyllables";
import { IconLoader, IconPause, IconPlay, IconSave, IconArrowRight, IconCheck } from "../../components/icons";

interface Draft { index: number; text: string; meaning: string }

export default function StepTranscribe({ project, setProject, run, busy, errors, setError, fileUrl, goTo }: StepProps) {
  const st = project.steps.transcribe;
  const sig = useMemo(() => project.lines.map((l) => `${l.index}|${l.text}|${l.meaning}`).join("\n"), [project.lines]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const player = useSegmentPlayer(fileUrl(project.files.vocals ?? project.files.original));

  useEffect(() => {
    if (dirty) return;
    setDrafts(project.lines.map((l) => ({ index: l.index, text: l.text ?? "", meaning: l.meaning ?? "" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((d) => d.map((x) => (x.index === i ? { ...x, ...patch } : x)));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError("save", null);
    try {
      const p = await api.saveLines(project.id, drafts);
      setDirty(false);
      setProject(p);
      setSaved(true);
    } catch (e) {
      setError("save", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const empty = drafts.filter((d) => !d.text.trim()).length;

  return (
    <StepCard
      number={3}
      title="Transcription et correction"
      subtitle="Chaque ligne chantée, avec son texte en langue source et son sens en français. L'artiste corrige : c'est lui qui connaît ses paroles."
      state={st}
      onRun={() => void run("transcribe")}
      runLabel="Lancer la transcription"
      busy={busy === "transcribe"}
      error={errors.transcribe ?? errors.save}
      runDisabled={project.steps.separate.status !== "done"}
    >
      {project.steps.separate.status !== "done" && <p className="mb-4 text-sm text-muted">Terminez d'abord la séparation : la transcription travaille sur la voix isolée.</p>}
      {project.mode === "demo" && (
        <p className="mb-4 rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm text-orange-200">
          Tapez les paroles, la transcription automatique demande le worker GPU. Les lignes sont détectées à partir des silences de la voix.
        </p>
      )}
      {drafts.length === 0 && st.status !== "running" && (
        <p className="text-muted">Aucune ligne pour l'instant. Lancez la transcription pour découper la voix en lignes.</p>
      )}
      <ol className="space-y-3">
        {drafts.map((d) => {
          const line = project.lines.find((l) => l.index === d.index)!;
          const playing = player.active === d.index;
          return (
            <li key={d.index} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-display text-sm font-extrabold text-violet-soft">Ligne {d.index + 1}</span>
                <span className="font-mono text-xs text-muted">{fmtSec(line.start)} à {fmtSec(line.end)}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!player.available}
                  onClick={() => player.play(d.index, line.start, line.end)}
                  aria-label={playing ? `Arrêter la ligne ${d.index + 1}` : `Écouter la ligne ${d.index + 1}`}
                >
                  {playing ? <IconPause size={12} /> : <IconPlay size={12} />} {playing ? "Stop" : "Écouter"}
                </button>
                {playing && (
                  <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <div className="h-full bg-lime" style={{ width: `${Math.min(100, ((player.time - line.start) / (line.end - line.start)) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`t-${d.index}`}>Paroles ({project.source_lang})</label>
                  <input id={`t-${d.index}`} className="field font-semibold" value={d.text} onChange={(e) => update(d.index, { text: e.target.value })} placeholder="Tapez les paroles chantées" />
                  <SyllableCounter text={d.text} lang={project.source_lang} />
                </div>
                <div>
                  <label className="label" htmlFor={`m-${d.index}`}>Sens en français</label>
                  <input id={`m-${d.index}`} className="field" value={d.meaning} onChange={(e) => update(d.index, { meaning: e.target.value })} placeholder="Ce que la ligne veut dire" />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {drafts.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 p-3 shadow-[0_-10px_40px_-10px_rgba(0,0,0,.6)] [background:rgba(23,17,48,.96)]">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <IconLoader size={16} /> : <IconSave size={16} />} Enregistrer les corrections
          </button>
          {dirty && <span className="text-sm text-orange-300">Modifications non enregistrées</span>}
          {saved && !dirty && <span className="flex items-center gap-1 text-sm text-lime"><IconCheck size={14} /> Enregistré</span>}
          {empty > 0 && <span className="text-sm text-muted">{empty} ligne{empty > 1 ? "s" : ""} sans paroles</span>}
          {saved && !dirty && (
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => goTo(3)}>
              Construire la grille musicale <IconArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </StepCard>
  );
}

function SyllableCounter({ text, lang }: { text: string; lang: string }) {
  const { count, split, loading, error } = useSyllables(text, lang);
  if (!text.trim()) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
      <span className="rounded-full bg-violet/30 px-2 py-0.5 font-mono text-xs font-bold text-violet-100">
        {loading && count === null ? "..." : error ? "?" : count} syllabe{count === 1 ? "" : "s"}
      </span>
      {loading && <IconLoader size={12} className="text-muted" />}
      {split.map((s, i) => (
        <span key={i} className="rounded-md bg-white/8 px-1.5 py-0.5 text-xs text-muted">{s}</span>
      ))}
    </div>
  );
}
