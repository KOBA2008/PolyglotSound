import { useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg } from "../../api";
import type { StepProps } from "./shared";
import { fmtSec } from "./shared";
import StepCard from "../../components/StepCard";
import { useSegmentPlayer } from "../../components/useSegmentPlayer";
import { useSyllables } from "../../components/useSyllables";
import YorubaKeyboard from "../../components/YorubaKeyboard";
import { insertAtCursor } from "../../components/insertAtCursor";
import { IconLoader, IconPause, IconPlay, IconSave, IconArrowRight, IconCheck } from "../../components/icons";
import { useOffline } from "../../health";

interface Draft { index: number; text: string; meaning: string }

export default function StepTranscribe({ project, setProject, run, busy, errors, setError, fileUrl, goTo }: StepProps) {
  const st = project.steps.transcribe;
  const offline = useOffline();
  const sig = useMemo(() => project.lines.map((l) => `${l.index}|${l.text}|${l.meaning}`).join("\n"), [project.lines]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lyricsRefs = useRef<Record<number, HTMLInputElement | null>>({});
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
  const insertYoruba = (d: Draft, ch: string) => insertAtCursor(lyricsRefs.current[d.index], ch, d.text, (text) => update(d.index, { text }));

  return (
    <StepCard
      number={3}
      title="Transcription et correction"
      subtitle="Paroles et sens, ligne par ligne. L'artiste corrige."
      state={st}
      onRun={() => void run("transcribe")}
      runLabel="Lancer la transcription"
      busy={busy === "transcribe"}
      error={errors.transcribe ?? errors.save}
      runDisabled={project.steps.separate.status !== "done"}
    >
      {project.steps.separate.status !== "done" && <p className="mb-4 text-sm text-muted">Lancez d'abord la séparation (étape 2).</p>}
      {project.mode === "demo" && (
        <p className="mb-4 rounded-xl border border-gold/25 bg-gold/8 p-3 text-sm text-gold-soft">
          Mode démo · saisie manuelle des paroles.
        </p>
      )}
      {drafts.length === 0 && st.status !== "running" && (
        <p className="text-muted">Aucune ligne. Lancez la transcription.</p>
      )}
      <ol className="space-y-3">
        {drafts.map((d) => {
          const line = project.lines.find((l) => l.index === d.index)!;
          const playing = player.active === d.index;
          return (
            <li key={d.index} className="neo-inset rounded-2xl p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-display text-sm font-extrabold text-brand-soft">Ligne {d.index + 1}</span>
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
                  <div className="neo-well h-1 w-32 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-brand" style={{ width: `${Math.min(100, ((player.time - line.start) / (line.end - line.start)) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`t-${d.index}`}>Paroles ({project.source_lang})</label>
                  <input ref={(el) => { lyricsRefs.current[d.index] = el; }} id={`t-${d.index}`} className="field font-semibold" value={d.text} onChange={(e) => update(d.index, { text: e.target.value })} placeholder="Tapez les paroles chantées" />
                  <YorubaKeyboard onInsert={(ch) => insertYoruba(d, ch)} label={`Clavier yorùbá · ligne ${d.index + 1}`} />
                  <SyllableCounter text={d.text} lang={project.source_lang} />
                </div>
                <div>
                  <label className="label" htmlFor={`m-${d.index}`}>Sens en français</label>
                  <input id={`m-${d.index}`} className="field" value={d.meaning} onChange={(e) => update(d.index, { meaning: e.target.value })} placeholder="Sens de la ligne" />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {drafts.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-surface/95 p-3 shadow-[0_-10px_30px_-14px_rgba(38,48,62,.25)] backdrop-blur">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={offline || saving || !dirty}
            title={offline ? "Indisponible en mode démo hors ligne" : undefined}>
            {saving ? <IconLoader size={16} /> : <IconSave size={16} />} Enregistrer
          </button>
          {dirty && <span className="text-sm text-gold-soft">Non enregistré</span>}
          {saved && !dirty && <span className="flex items-center gap-1 text-sm text-mint"><IconCheck size={14} /> Enregistré</span>}
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
      <span className="rounded-[9px] px-2 py-1 font-mono text-xs font-bold text-brand-soft shadow-[var(--inset-sm)]">
        {loading && count === null ? "..." : error ? "?" : count} syllabe{count === 1 ? "" : "s"}
      </span>
      {loading && <IconLoader size={12} className="text-muted" />}
      {split.map((s, i) => (
        <span key={i} className="rounded-md border border-ink/5 bg-white/60 px-1.5 py-0.5 text-xs text-muted">{s}</span>
      ))}
    </div>
  );
}
