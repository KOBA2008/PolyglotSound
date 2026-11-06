import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { IconPause, IconPlay } from "./icons";
import { fmtTime } from "./AudioPlayer";

/** Lecteur comparatif : bascule A/B synchronisée au même currentTime. */
export default function ABPlayer({ a, b, labelA = "Original", labelB = "PolyglotSound" }: { a: string | null; b: string | null; labelA?: string; labelB?: string }) {
  const ra = useRef<HTMLAudioElement>(null);
  const rb = useRef<HTMLAudioElement>(null);
  const [side, setSide] = useState<"A" | "B">("B");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  const cur = () => (side === "A" ? ra.current : rb.current);
  const other = () => (side === "A" ? rb.current : ra.current);

  useEffect(() => () => { ra.current?.pause(); rb.current?.pause(); }, []);

  const toggle = () => {
    const c = cur();
    if (!c) return;
    if (c.paused) { void c.play(); setPlaying(true); } else { c.pause(); setPlaying(false); }
  };

  const switchTo = (s: "A" | "B") => {
    if (s === side) return;
    const c = cur();
    const o = other();
    if (c && o) {
      o.currentTime = Math.min(c.currentTime, isFinite(o.duration) ? o.duration : c.currentTime);
      if (!c.paused) { c.pause(); void o.play(); }
    }
    setSide(s);
  };

  const seek = (t: number) => {
    if (ra.current) ra.current.currentTime = t;
    if (rb.current) rb.current.currentTime = t;
    setTime(t);
  };

  const onTime = (s: "A" | "B") => (e: SyntheticEvent<HTMLAudioElement>) => {
    if (s === side) setTime(e.currentTarget.currentTime);
  };

  const disabled = !a || !b;
  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div className="glass p-5">
      {a && <audio ref={ra} src={a} preload="auto" onTimeUpdate={onTime("A")} onEnded={() => setPlaying(false)} onLoadedMetadata={(e) => setDur((d) => Math.max(d, e.currentTarget.duration))} />}
      {b && <audio ref={rb} src={b} preload="auto" onTimeUpdate={onTime("B")} onEnded={() => setPlaying(false)} onLoadedMetadata={(e) => setDur((d) => Math.max(d, e.currentTarget.duration))} />}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label={playing ? "Pause" : "Lecture"}
          className="grad flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white shadow-[0_10px_40px_-10px_rgba(214,36,159,.9)] transition hover:scale-105 disabled:opacity-40"
        >
          {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
        </button>
        <div className="inline-flex rounded-full border border-white/15 bg-black/30 p-1" role="radiogroup" aria-label="Version écoutée">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              disabled={disabled}
              onClick={() => switchTo(s)}
              className={`rounded-full px-5 py-2.5 font-display text-sm font-extrabold transition ${side === s ? (s === "A" ? "bg-violet text-white" : "grad text-white") : "text-muted hover:text-white"}`}
            >
              {s === "A" ? labelA : labelB}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-sm text-muted">{fmtTime(time)} / {fmtTime(dur)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={dur || 0}
        step={0.01}
        value={time}
        disabled={disabled}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Position de lecture"
        className="mt-4 h-2 w-full"
        style={{ background: `linear-gradient(90deg, #d6249f ${pct}%, rgba(255,255,255,.15) ${pct}%)` }}
      />
      {disabled && <p className="mt-3 text-sm text-muted">La comparaison sera disponible après la finalisation.</p>}
      {!disabled && <p className="mt-3 text-sm text-muted">Basculez pendant la lecture : les deux versions restent calées au même instant.</p>}
    </div>
  );
}
