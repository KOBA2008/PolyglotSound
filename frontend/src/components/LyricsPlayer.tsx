import { useEffect, useRef, useState } from "react";
import type { Line } from "../types";

/** Lecteur façon Spotify : paroles traduites synchronisées, remplissage karaoké de la ligne en cours,
 *  ligne d'origine en dessous, défilement automatique, bascule original / version adaptée au même instant. */
export default function LyricsPlayer({ lines, adapted, original, adaptedLabel = "Version adaptée", originalLabel = "Original" }: {
  lines: Line[];
  adapted: string | null;
  original: string | null;
  adaptedLabel?: string;
  originalLabel?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState<"adapted" | "original">(adapted ? "adapted" : "original");
  const url = src === "adapted" ? adapted : original;
  const shown = lines.filter((l) => l.end > l.start);
  const active = shown.findIndex((l) => t >= l.start && t < l.end);

  // horloge fluide (60 i/s) pendant la lecture
  useEffect(() => {
    let id = 0;
    const tick = () => { if (audio.current) setT(audio.current.currentTime); id = requestAnimationFrame(tick); };
    if (playing) id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  // défilement automatique dans le cadre (sans faire bouger la page)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [active]);

  function swap(next: "adapted" | "original") {
    const at = audio.current?.currentTime ?? 0;
    const wasPlaying = playing;
    setSrc(next);
    requestAnimationFrame(() => {
      const a = audio.current;
      if (!a) return;
      const go = () => { a.currentTime = at; if (wasPlaying) void a.play(); a.removeEventListener("loadedmetadata", go); };
      a.addEventListener("loadedmetadata", go);
    });
  }

  function seek(sec: number) {
    if (!audio.current) return;
    audio.current.currentTime = sec;
    setT(sec);
    if (!playing) void audio.current.play();
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1650] to-[#0f0b1f] text-white shadow-xl">
      <audio
        ref={audio}
        src={url ?? undefined}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => !playing && setT(e.currentTarget.currentTime)}
      />
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Lecture"}
          onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
          disabled={!url}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl font-bold text-[#0f0b1f] transition hover:scale-105 disabled:opacity-40"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="flex rounded-full bg-white/10 p-1 text-sm font-semibold">
          {adapted && (
            <button type="button" onClick={() => swap("adapted")}
              className={`rounded-full px-4 py-1.5 transition ${src === "adapted" ? "bg-white text-[#0f0b1f]" : "text-white/70"}`}>
              {adaptedLabel}
            </button>
          )}
          {original && (
            <button type="button" onClick={() => swap("original")}
              className={`rounded-full px-4 py-1.5 transition ${src === "original" ? "bg-white text-[#0f0b1f]" : "text-white/70"}`}>
              {originalLabel}
            </button>
          )}
        </div>
        <span className="ml-auto text-sm tabular-nums text-white/60">{fmt(t)} / {fmt(dur)}</span>
      </div>
      <input
        type="range" min={0} max={dur || 0} step={0.01} value={Math.min(t, dur || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Position"
        className="mx-5 mt-3 w-[calc(100%-2.5rem)] accent-white"
      />
      <div ref={box} className="relative h-[340px] overflow-y-auto px-5 py-24 [scrollbar-width:none]">
        {shown.length === 0 && <p className="text-center text-white/60">Aucune parole synchronisée.</p>}
        {shown.map((l, i) => {
          const isActive = i === active;
          const past = active >= 0 && i < active;
          const pct = isActive ? Math.min(100, Math.max(0, ((t - l.start) / (l.end - l.start)) * 100)) : past ? 100 : 0;
          const main = (src === "adapted" ? l.chosen : l.text) || l.text || "♪";
          const sub = src === "adapted" ? l.text : l.chosen;
          return (
            <button
              key={l.index} data-i={i} type="button" onClick={() => seek(l.start)}
              className={`block w-full py-2 text-left transition-all duration-300 ${isActive ? "scale-[1.02]" : "opacity-50 hover:opacity-80"}`}
            >
              <span
                className="block font-display text-2xl font-extrabold leading-tight sm:text-3xl"
                style={{
                  backgroundImage: `linear-gradient(90deg, #ffffff ${pct}%, rgba(255,255,255,0.35) ${pct}%)`,
                  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                }}
              >
                {main}
              </span>
              {sub && <span className="mt-1 block text-sm text-white/55">{sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
