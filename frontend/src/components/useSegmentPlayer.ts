import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lecteur caché pour écouter un extrait (une ligne) d'un fichier audio
 * en réglant currentTime. Expose le temps courant pour animer les grilles.
 */
export function useSegmentPlayer(src: string | null | undefined) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const endRef = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!src) return;
    const a = new Audio(src);
    a.preload = "auto";
    audio.current = a;
    return () => {
      a.pause();
      cancelAnimationFrame(raf.current);
      audio.current = null;
      setActive(null);
    };
  }, [src]);

  const stop = useCallback(() => {
    audio.current?.pause();
    cancelAnimationFrame(raf.current);
    setActive(null);
  }, []);

  const play = useCallback((key: number, start: number, end: number) => {
    const a = audio.current;
    if (!a) return;
    if (active === key && !a.paused) { stop(); return; }
    a.currentTime = start;
    endRef.current = end;
    setActive(key);
    void a.play().catch(() => setActive(null));
    const tick = () => {
      if (!audio.current) return;
      const t = audio.current.currentTime;
      setTime(t);
      if (t >= endRef.current || audio.current.paused) {
        audio.current.pause();
        setActive(null);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [active, stop]);

  return { play, stop, active, time, available: !!src };
}
