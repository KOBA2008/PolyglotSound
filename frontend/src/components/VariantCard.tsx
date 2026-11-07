import type { Variant } from "../types";
import SyllableGrid, { cellsFromSplit, type Cell } from "./SyllableGrid";
import { IconCheck } from "./icons";

export function SyllableCountBadge({ count, target }: { count: number; target: number }) {
  const ok = count === target;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[9px] px-2.5 py-1 font-mono text-xs font-bold shadow-[var(--inset-sm)] ${ok ? "text-mint" : "text-flame-soft"}`}
      aria-label={`${count} syllabes sur ${target}${ok ? ", compte exact" : ", compte incorrect"}`}
    >
      {count}/{target} syllabes
    </span>
  );
}

interface Props {
  variant: Variant;
  target: number;
  refCells: Cell[];
  t0: number;
  t1: number;
  selected?: boolean;
  onSelect?: () => void;
  index?: number;
}

/** Carte d'une variante de traduction : texte, compte de syllabes, pastilles alignées sur la grille. */
export default function VariantCard({ variant, target, refCells, t0, t1, selected, onSelect, index }: Props) {
  const split = variant.split?.length ? variant.split : [variant.text];
  const count = variant.syllables ?? split.length;
  const ok = count === target;
  const cells = cellsFromSplit(split, refCells, t0, t1);
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      aria-pressed={onSelect ? !!selected : undefined}
      className={`glass fade-in block w-full p-4 text-left transition ${onSelect ? "cursor-pointer hover:brightness-[1.02]" : ""} ${selected ? "!border-brand-soft ring-2 ring-brand-soft/35 shadow-[0_12px_26px_-16px_rgba(6,106,74,.55)]" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {index != null ? `Variante ${index + 1}` : "Variante"}
        </span>
        <div className="flex items-center gap-2">
          <SyllableCountBadge count={count} target={target} />
          {selected && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-white"><IconCheck size={14} /></span>
          )}
        </div>
      </div>
      <p className="font-display text-lg font-bold leading-snug">{variant.text}</p>
      <div className="mt-3">
        <SyllableGrid cells={cells} t0={t0} t1={t1} tone={ok ? "target" : "bad"} height={32} label="Syllabes de la variante" />
      </div>
    </Tag>
  );
}
