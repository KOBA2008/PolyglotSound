import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { IconDownload, IconPause, IconPlay } from "./icons";

export interface AudioPlayerHandle {
  audio: HTMLAudioElement | null;
  playSegment: (start: number, end: number) => void;
}

export function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  src: string | null | undefined;
  label: string;
  accent?: "brand" | "gold" | "teal" | "flame" | "mint";
  download?: boolean;
  ref?: Ref<AudioPlayerHandle>;
  onTime?: (t: number) => void;
}

const ACCENTS: Record<string, string> = {
  brand: "from-brand to-brand-soft",
  gold: "from-brand to-gold",
  teal: "from-teal to-mint",
  flame: "from-gold to-flame",
  mint: "from-mint to-teal",
};

/** Lecteur audio stylé, sans dépendance. */
export default function AudioPlayer({ src, label, accent = "gold", download, ref, onTime }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState(false);

  useImperativeHandle(ref, () => ({
    audio: audioRef.current,
    playSegment: (start: number, end: number) => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = start;
      stopAt.current = end;
      void a.play();
    },
  }));

  useEffect(() => { setErr(false); setPlaying(false); setTime(0); }, [src]);

  if (!src) {
    return (
      <div className="glass flex items-center gap-3 p-3 opacity-60">
        <div className="neo-inset flex h-10 w-10 items-center justify-center rounded-full"><IconPlay size={16} /></div>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-xs text-muted">Pas encore disponible</div>
        </div>
      </div>
    );
  }

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    stopAt.current = null;
    if (a.paused) void a.play(); else a.pause();
  };

  const pct = dur > 0 ? (time / dur) * 100 : 0;

  return (
    <div className="glass p-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onError={() => setErr(true)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setTime(t);
          onTime?.(t);
          if (stopAt.current !== null && t >= stopAt.current) {
            e.currentTarget.pause();
            stopAt.current = null;
          }
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause : ${label}` : `Lire : ${label}`}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${ACCENTS[accent]} text-white shadow-[0_6px_14px_-6px_rgba(38,48,62,.45)] transition hover:scale-105`}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{label}</span>
            <span className="shrink-0 font-mono text-xs text-muted">{fmtTime(time)} / {fmtTime(dur)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.01}
            value={time}
            aria-label={`Position dans ${label}`}
            onChange={(e) => {
              const a = audioRef.current;
              if (a) a.currentTime = Number(e.target.value);
            }}
            className="mt-1 h-1.5 w-full cursor-pointer"
            style={{ background: `linear-gradient(90deg, #007a56 ${pct}%, rgba(38,48,62,.12) ${pct}%)` }}
          />
          {err && <div className="mt-1 text-xs text-flame">Fichier audio illisible ou introuvable.</div>}
        </div>
        {download && (
          <a href={src} download className="btn btn-ghost btn-sm" aria-label={`Télécharger ${label}`}>
            <IconDownload size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
