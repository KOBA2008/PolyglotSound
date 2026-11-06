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
      verdict = { tone: "border-lime/60 bg-lime/10 text-lime", icon: <IconShield size={40} />, title: "Version autorisée PolyglotSound", text: "Ce fichier porte le filigrane AudioSeal d'une adaptation validée par l'artiste." };
    } else if (res.mode === "demo") {
      verdict = { tone: "border-orange/60 bg-orange/10 text-orange-300", icon: <IconAlert size={40} />, title: "Mode démo", text: "La détection AudioSeal demande le worker GPU. Aucun verdict fiable n'est possible pour l'instant." };
    } else {
      verdict = { tone: "border-red-400/60 bg-red-500/10 text-red-300", icon: <IconX size={40} />, title: "Aucun filigrane détecté", text: "Ce fichier ne provient pas d'une adaptation PolyglotSound signée, ou il a été fortement altéré." };
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-4">
      <header>
        <p className="kicker">Traçabilité</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Vérificateur de <span className="grad-text">filigrane</span></h1>
        <p className="mt-3 text-lg text-muted">Une version circule ? Déposez-la : le filigrane inaudible AudioSeal dit si elle a été autorisée par l'artiste.</p>
      </header>
      <div className="glass space-y-4 p-5 md:p-7">
        <DropZone file={file} onFile={(f) => { setFile(f); setRes(null); }} label="Glissez le fichier à vérifier" />
        <button type="button" className="btn btn-primary w-full py-3" disabled={!file || loading} onClick={() => void check()}>
          {loading ? <IconLoader size={18} /> : <IconShield size={18} />} {loading ? "Analyse..." : "Vérifier"}
        </button>
        {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
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
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="grad h-full rounded-full" style={{ width: `${Math.min(100, (res.confidence ?? 0) * 100)}%` }} /></div>
              </div>
            )}
            {res.message && <p className="mt-3 text-sm">Message embarqué : <code className="rounded bg-black/30 px-1.5 py-0.5">{res.message}</code></p>}
          </div>
        </div>
      )}
    </div>
  );
}
