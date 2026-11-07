import { useState, type ReactNode } from "react";
import { api, errMsg } from "../api";
import type { WatermarkResult } from "../types";
import DropZone from "../components/DropZone";
import { IconAlert, IconLoader, IconShield, IconX } from "../components/icons";

export default function Verifier() {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<WatermarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setRes(null);
    try { setRes(await api.detectWatermark(file)); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  };

  let verdict: { tone: string; icon: ReactNode; title: string; text: string } | null = null;
  if (res) {
    if (res.detected) {
      verdict = { tone: "border-mint/30 bg-mint/8 text-mint", icon: <IconShield size={40} />, title: "Version autorisée", text: "Adaptation validée par l'artiste." };
    } else if (res.mode === "demo") {
      verdict = { tone: "border-gold/30 bg-gold/8 text-gold-soft", icon: <IconAlert size={40} />, title: "Mode démo", text: "Worker GPU requis pour AudioSeal." };
    } else {
      verdict = { tone: "border-flame/30 bg-flame/8 text-flame-soft", icon: <IconX size={40} />, title: "Aucun filigrane détecté", text: "Pas de signature PolyglotSound." };
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-4">
      <header className="flex items-center justify-between gap-6">
        <div>
          <p className="kicker">Traçabilité</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Vérificateur de <span className="grad-text">filigrane</span></h1>
          <p className="mt-3 text-lg text-muted">Déposez un fichier. AudioSeal dit s'il est autorisé.</p>
        </div>
        <img
          src="/photos/verifier-voice.jpg"
          alt="Chanteur au micro"
          width={112}
          height={112}
          loading="lazy"
          className="hidden h-28 w-28 shrink-0 rounded-2xl object-cover shadow-[var(--raise-sm)] ring-1 ring-white/60 sm:block"
        />
      </header>
      <div className="glass space-y-4 p-5 md:p-7">
        <DropZone file={file} onFile={(f) => { setFile(f); setRes(null); }} label="Glissez le fichier à vérifier" />
        <button type="button" className="btn btn-primary w-full py-3" disabled={!file || loading} onClick={() => void check()}>
          {loading ? <IconLoader size={18} /> : <IconShield size={18} />} {loading ? "Analyse..." : "Vérifier"}
        </button>
        {error && <p role="alert" className="rounded-xl border border-flame/30 bg-flame/8 p-3 text-sm text-flame-soft">{error}</p>}
      </div>
      {verdict && res && (
        <div className={`fade-in flex items-start gap-5 rounded-3xl border-2 p-6 ${verdict.tone}`} role="status">
          <div className="shrink-0">{verdict.icon}</div>
          <div className="min-w-0 text-ink">
            <h2 className="font-display text-2xl font-extrabold">{verdict.title}</h2>
            <p className="mt-1 text-muted">{verdict.text}</p>
            {res.mode !== "demo" && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted"><span>Confiance</span><span className="font-mono">{Math.round((res.confidence ?? 0) * 100)} %</span></div>
                <div className="neo-well mt-1 h-2 overflow-hidden"><div className="grad h-full rounded-full" style={{ width: `${Math.min(100, (res.confidence ?? 0) * 100)}%` }} /></div>
              </div>
            )}
            {res.message && <p className="mt-3 text-sm">Message embarqué : <code className="rounded border border-ink/10 bg-white/70 px-1.5 py-0.5">{res.message}</code></p>}
          </div>
        </div>
      )}
    </div>
  );
}
