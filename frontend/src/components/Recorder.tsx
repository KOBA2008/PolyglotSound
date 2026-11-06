import { useEffect, useRef, useState } from "react";
import { IconMic, IconStop } from "./icons";
import { fmtTime } from "./AudioPlayer";

/** Enregistrement micro (MediaRecorder), avec instrumentale en retour optionnelle. */
export default function Recorder({ backing, onDone }: { backing?: string | null; onDone: (blob: Blob, ext: string) => void }) {
  const [rec, setRec] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [withBacking, setWithBacking] = useState(true);
  const mr = useRef<MediaRecorder | null>(null);
  const back = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => () => {
    clearInterval(timer.current);
    mr.current?.stream.getTracks().forEach((t) => t.stop());
    back.current?.pause();
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        onDone(new Blob(chunks, { type }), ext);
      };
      mr.current = r;
      r.start();
      setRec(true);
      const t0 = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
      if (withBacking && backing) {
        back.current = new Audio(backing);
        back.current.currentTime = 0;
        void back.current.play().catch(() => {});
      }
    } catch {
      setError("Micro inaccessible : autorisez le micro dans le navigateur (localhost ou HTTPS requis).");
    }
  };

  const stop = () => {
    mr.current?.stop();
    back.current?.pause();
    clearInterval(timer.current);
    setRec(false);
  };

  if (!supported) return <p className="text-sm text-muted">L'enregistrement micro n'est pas pris en charge par ce navigateur.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!rec ? (
          <button type="button" className="btn btn-ghost" onClick={() => void start()}>
            <IconMic size={16} className="text-magenta" /> Enregistrer au micro
          </button>
        ) : (
          <button type="button" className="btn bg-red-600 text-white hover:bg-red-500" onClick={stop}>
            <IconStop size={14} /> Arrêter ({fmtTime(elapsed)})
          </button>
        )}
        {rec && <span className="flex items-center gap-2 text-sm text-red-300"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Enregistrement</span>}
      </div>
      {backing && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={withBacking} onChange={(e) => setWithBacking(e.target.checked)} disabled={rec} />
          Jouer l'instrumentale pendant l'enregistrement (casque conseillé)
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
