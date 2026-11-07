import { useEffect, useMemo, useState } from "react";
import { api, errMsg } from "../../api";
import type { Line, TargetLang } from "../../types";
import { langLabel } from "../../types";
import type { StepProps } from "./shared";
import StepCard from "../../components/StepCard";
import SyllableGrid, { cellsFromLine, type Cell } from "../../components/SyllableGrid";
import VariantCard from "../../components/VariantCard";
import { useSyllables } from "../../components/useSyllables";
import { IconCheck, IconLoader, IconSave, IconArrowRight } from "../../components/icons";

export default function StepTranslate({ project, setProject, run, busy, errors, setError, goTo }: StepProps) {
  const st = project.steps.translate;
  const lines = project.lines;
  const sig = useMemo(() => lines.map((l) => `${l.index}|${l.chosen}|${l.variants?.map((v) => v.text).join("/")}`).join("\n"), [lines]);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (dirty) return;
    const c: Record<number, string> = {};
    for (const l of lines) {
      const t = l.chosen ?? l.variants?.find((v) => v.ok)?.text ?? l.variants?.[0]?.text;
      if (t) c[l.index] = t;
    }
    setChoices(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const choose = (i: number, text: string) => {
    setChoices((c) => ({ ...c, [i]: text }));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError("save", null);
    try {
      const list = Object.entries(choices).filter(([, t]) => t.trim()).map(([i, text]) => ({ index: Number(i), text: text.trim() }));
      const p = await api.saveChoices(project.id, list);
      setDirty(false);
      setProject(p);
      setSaved(true);
    } catch (e) {
      setError("save", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const hasVariants = lines.some((l) => l.variants?.length);
  const okCount = lines.filter((l) => {
    const c = choices[l.index];
    const v = l.variants?.find((x) => x.text === c);
    return v ? v.syllables === l.n_syllables : false;
  }).length;

  return (
    <StepCard
      number={5}
      title="Traduction qui se chante"
      subtitle={`Trois variantes en ${langLabel(project.target_lang).toLowerCase()} par ligne, chacune vérifiée syllabe par syllabe contre la grille originale. L'artiste choisit, ou réécrit.`}
      state={st}
      onRun={() => void run("translate", { n_variants: 3 })}
      runLabel="Générer les variantes"
      busy={busy === "translate"}
      error={errors.translate ?? errors.save}
      runDisabled={project.steps.align.status !== "done"}
    >
      {project.steps.align.status !== "done" && <p className="mb-4 text-sm text-muted">Construisez d'abord la grille musicale (étape 4) : elle fixe le nombre de syllabes à respecter.</p>}
      {hasVariants && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-[9px] px-3 py-1 font-semibold text-mint shadow-[var(--inset-sm)]">{okCount}/{lines.length} lignes au bon nombre de syllabes</span>
          </div>
          <ol className="space-y-6">
            {lines.map((l) => (
              <LineTranslate key={l.index} line={l} lang={project.target_lang} choice={choices[l.index] ?? ""} onChoose={(t) => choose(l.index, t)} />
            ))}
          </ol>
          <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-surface/95 p-3 shadow-[0_-10px_30px_-14px_rgba(38,48,62,.25)] backdrop-blur">
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || (!dirty && saved)}>
              {saving ? <IconLoader size={16} /> : <IconSave size={16} />} Enregistrer les choix
            </button>
            {dirty && <span className="text-sm text-gold-soft">Choix non enregistrés</span>}
            {saved && !dirty && (
              <>
                <span className="flex items-center gap-1 text-sm text-mint"><IconCheck size={14} /> Choix enregistrés</span>
                <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => goTo(5)}>Passer au chant <IconArrowRight size={14} /></button>
              </>
            )}
          </div>
        </>
      )}
    </StepCard>
  );
}

function LineTranslate({ line, lang, choice, onChoose }: { line: Line; lang: TargetLang; choice: string; onChoose: (t: string) => void }) {
  const ref: Cell[] = cellsFromLine(line);
  const target = line.n_syllables || ref.length;
  const variants = line.variants ?? [];
  const isVariant = variants.some((v) => v.text === choice);
  const [custom, setCustom] = useState(!isVariant ? choice : "");
  const live = useSyllables(custom, lang);

  return (
    <li className="neo-inset rounded-2xl p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="font-display text-sm font-extrabold text-brand-soft">Ligne {line.index + 1}</span>
        <span className="font-display text-lg font-bold">{line.text}</span>
        {line.meaning && <span className="text-sm italic text-muted">« {line.meaning} »</span>}
      </div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Grille originale · {target} syllabes</div>
      <SyllableGrid cells={ref} t0={line.start} t1={line.end} height={36} label={`Grille originale de la ligne ${line.index + 1}`} />
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {variants.map((v, k) => (
          <VariantCard key={k} index={k} variant={v} target={target} refCells={ref} t0={line.start} t1={line.end} selected={choice === v.text} onSelect={() => onChoose(v.text)} />
        ))}
      </div>
      <div className="mt-4">
        <label className="label" htmlFor={`c-${line.index}`}>Votre version (édition libre)</label>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            id={`c-${line.index}`}
            className={`field ${!isVariant && choice ? "!border-gold-soft" : ""}`}
            value={custom}
            placeholder="Réécrivez la ligne : le compte de syllabes se met à jour en direct"
            onChange={(e) => { setCustom(e.target.value); onChoose(e.target.value); }}
          />
          {custom && !isVariant && <span className="self-center whitespace-nowrap text-xs font-semibold text-gold-soft">Version choisie</span>}
          {custom && isVariant && (
            <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap" onClick={() => onChoose(custom)}>Choisir ma version</button>
          )}
        </div>
        {custom.trim() && live.count !== null && (
          <div className="mt-3">
            <VariantCard
              variant={{ text: custom, syllables: live.count, split: live.split, ok: live.count === target }}
              target={target}
              refCells={ref}
              t0={line.start}
              t1={line.end}
              selected={!isVariant && choice === custom}
            />
          </div>
        )}
      </div>
    </li>
  );
}
