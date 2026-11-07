import type { Line, Pitch } from "../types";

export interface Cell {
  text: string;
  start: number;
  end: number;
  stress: boolean;
}

/** Cases d'une ligne : syllabes horodatées si présentes, sinon réparties uniformément. */
export function cellsFromLine(line: Line, texts?: string[]): Cell[] {
  if (line.syllables && line.syllables.length) return line.syllables.map((s) => ({ ...s }));
  const n = texts?.length || line.n_syllables || 0;
  if (!n) return [];
  return uniformCells(n, line.stress_positions ?? [], texts, line.start, line.end);
}

export function uniformCells(n: number, stress: number[], labels?: string[], t0 = 0, t1 = n): Cell[] {
  const d = (t1 - t0) / Math.max(n, 1);
  const set = new Set(stress);
  return Array.from({ length: n }, (_, i) => ({
    text: labels?.[i] ?? "",
    start: t0 + i * d,
    end: t0 + (i + 1) * d,
    stress: set.has(i),
  }));
}

/**
 * Place les syllabes d'une traduction sur la grille originale : si le compte
 * correspond, chaque syllabe hérite de la case (position, durée, accent) de l'originale.
 */
export function cellsFromSplit(split: string[], ref: Cell[], t0: number, t1: number): Cell[] {
  if (ref.length && split.length === ref.length) {
    return ref.map((c, i) => ({ ...c, text: split[i] }));
  }
  return uniformCells(split.length, [], split, t0, t1);
}

interface Props {
  cells: Cell[];
  t0: number;
  t1: number;
  tone?: "source" | "target" | "bad";
  pitch?: Pitch | null;
  currentTime?: number | null;
  height?: number;
  ticks?: boolean;
  onToggle?: (i: number) => void;
  label?: string;
}

const TONES = {
  source: { strong: "bg-gradient-to-b from-gold to-gold-soft border-gold/40 text-white shadow-[0_6px_12px_-8px_rgba(138,92,0,.6)]", weak: "bg-gold/12 border-gold/25 text-ink" },
  target: { strong: "bg-gradient-to-b from-brand to-brand-soft border-brand/40 text-white shadow-[0_6px_12px_-8px_rgba(0,106,76,.55)]", weak: "bg-teal/10 border-teal/25 text-ink" },
  bad: { strong: "bg-flame border-flame-soft/60 text-white", weak: "bg-flame/10 border-flame/30 text-flame-soft" },
};

/** Grille musicale : une case par syllabe, largeur proportionnelle à sa durée, or = temps fort. */
export default function SyllableGrid({ cells, t0, t1, tone = "source", pitch, currentTime, height = 46, ticks, onToggle, label }: Props) {
  const span = Math.max(t1 - t0, 0.001);
  const pos = (t: number) => ((t - t0) / span) * 100;
  const playing = currentTime != null && currentTime >= t0 && currentTime <= t1;
  const pal = TONES[tone];

  return (
    <div className="w-full" role="group" aria-label={label ?? "Grille de syllabes"}>
      <div className="relative w-full" style={{ height: height + (pitch ? 44 : 0) }}>
        {pitch && <PitchCurve pitch={pitch} t0={t0} t1={t1} height={40} />}
        <div className="absolute inset-x-0 bottom-0" style={{ height }}>
          {cells.map((c, i) => {
            const active = playing && currentTime! >= c.start && currentTime! < c.end;
            const style = { left: `${pos(c.start)}%`, width: `${Math.max(pos(c.end) - pos(c.start), 0.5)}%` };
            const cls = `absolute top-0 bottom-0 flex items-center justify-center overflow-hidden rounded-lg border px-0.5 text-[13px] font-semibold leading-none transition-all duration-150 ${c.stress ? pal.strong : pal.weak} ${active ? "scale-y-110 ring-2 ring-brand brightness-105" : ""}`;
            const title = `${c.text || "syllabe " + (i + 1)}${c.stress ? " (temps fort)" : ""}${tone !== "bad" ? ` · ${c.start.toFixed(2)}s` : ""}`;
            const inner = <span className="truncate">{c.text}</span>;
            return onToggle ? (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(i)}
                aria-pressed={c.stress}
                aria-label={`Syllabe ${i + 1}${c.stress ? ", temps fort" : ""}`}
                className={`${cls} cursor-pointer hover:brightness-125`}
                style={{ ...style, marginLeft: 2, width: `calc(${style.width} - 4px)` }}
              >
                {inner || <span className="text-xs opacity-70">{i + 1}</span>}
              </button>
            ) : (
              <div key={i} className={cls} style={{ ...style, marginLeft: 1.5, width: `calc(${style.width} - 3px)` }} title={title}>
                {inner}
              </div>
            );
          })}
          {playing && (
            <div className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 rounded bg-brand shadow-[0_0_0_2px_rgba(255,255,255,.75),0_2px_6px_rgba(38,48,62,.3)]" style={{ left: `${pos(currentTime!)}%` }} />
          )}
        </div>
      </div>
      {ticks && <Ticks t0={t0} t1={t1} />}
    </div>
  );
}

function Ticks({ t0, t1 }: { t0: number; t1: number }) {
  const span = t1 - t0;
  const step = span > 12 ? 2 : span > 5 ? 1 : 0.5;
  const out: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-6; t += step) out.push(t);
  return (
    <div className="relative mt-1 h-4 text-[10px] text-muted" aria-hidden="true">
      {out.map((t) => (
        <span key={t} className="absolute -translate-x-1/2 font-mono" style={{ left: `${((t - t0) / span) * 100}%` }}>
          {t.toFixed(step < 1 ? 1 : 0)}s
        </span>
      ))}
    </div>
  );
}

/** Courbe de mélodie (f0) sur l'intervalle [t0, t1], échelle logarithmique. */
export function PitchCurve({ pitch, t0, t1, height = 40 }: { pitch: Pitch; t0: number; t1: number; height?: number }) {
  const { hop, f0 } = pitch;
  if (!hop || !f0?.length) return null;
  const i0 = Math.max(0, Math.floor(t0 / hop));
  const i1 = Math.min(f0.length - 1, Math.ceil(t1 / hop));
  const voiced = f0.slice(i0, i1 + 1).filter((v) => v > 0);
  if (voiced.length < 2) return null;
  const lmin = Math.log2(Math.min(...voiced)) - 0.1;
  const lmax = Math.log2(Math.max(...voiced)) + 0.1;
  const W = 1000;
  const paths: string[] = [];
  let cur = "";
  // sous-échantillonnage pour garder un SVG léger
  const stride = Math.max(1, Math.floor((i1 - i0) / 600));
  for (let i = i0; i <= i1; i += stride) {
    const v = f0[i];
    if (v > 0) {
      const x = (((i * hop) - t0) / (t1 - t0)) * W;
      const y = height - ((Math.log2(v) - lmin) / (lmax - lmin)) * (height - 4) - 2;
      cur += `${cur ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    } else if (cur) {
      paths.push(cur);
      cur = "";
    }
  }
  if (cur) paths.push(cur);
  return (
    <svg className="absolute inset-x-0 top-0 w-full" style={{ height }} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-label="Courbe de mélodie de la voix" role="img">
      <defs>
        <linearGradient id="f0grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset=".5" stopColor="#14a06a" />
          <stop offset="1" stopColor="#a86f00" />
        </linearGradient>
      </defs>
      {paths.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="url(#f0grad)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
