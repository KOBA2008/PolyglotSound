import type { Variant } from "../types";
import SyllableGrid, { cellsFromSplit, type Cell } from "./SyllableGrid";
import { IconCheck } from "./icons";

export function SyllableCountBadge({ count, target }: { count: number; target: number }) {
  const ok = count === target;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${ok ? "border-lime/60 bg-lime/15 text-lime" : "border-red-400/60 bg-red-500/15 text-red-300"}`}
      aria-label={`${count} syllabes sur ${target}${ok ? ", compte exact" : ", compte incorrect"}`}
    >
      {count}/{target}{ok ? " syllabes ✓" : ""}
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
      className={`glass fade-in block w-full p-4 text-left transition ${onSelect ? "cursor-pointer hover:bg-white/8" : ""} ${selected ? "!border-magenta ring-2 ring-magenta/60 shadow-[0_0_30px_-8px_rgba(214,36,159,.8)]" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {index != null ? `Variante ${index + 1}` : "Variante"}
        </span>
        <div className="flex items-center gap-2">
          <SyllableCountBadge count={count} target={target} />
          {selected && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-magenta text-white"><IconCheck size={14} /></span>
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
