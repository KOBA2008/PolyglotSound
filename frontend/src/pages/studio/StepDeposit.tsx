import { useState, type FormEvent } from "react";
import { api, errMsg } from "../../api";
import type { Project, SourceLang, TargetLang } from "../../types";
import { SOURCE_LANGS, TARGET_LANGS, langLabel } from "../../types";
import StepCard from "../../components/StepCard";
import DropZone from "../../components/DropZone";
import AudioPlayer from "../../components/AudioPlayer";
import { IconCheck, IconLoader, IconShield, IconArrowRight } from "../../components/icons";

interface Props {
  project: Project | null;
  onCreated: (p: Project) => void;
  fileUrl: (p: string | null | undefined) => string | null;
}

export default function StepDeposit({ project, onCreated, fileUrl }: Props) {
  if (project) {
    return (
      <StepCard number={1} title="Dépôt" subtitle="Le morceau de départ et l'accord de l'artiste." state={{ status: "done", message: "", progress: 100 }}>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Titre", project.title],
            ["Artiste", project.artist],
            ["Langues", `${langLabel(project.source_lang)} → ${langLabel(project.target_lang)}`],
            ["Durée", project.duration ? `${project.duration.toFixed(1)} s` : "inconnue"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/70 bg-white/60 p-3">
              <dt className="label">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center gap-2 text-sm text-mint">
          <IconShield size={16} /> Consentement de l'artiste certifié
        </div>
        <div className="mt-4"><AudioPlayer src={fileUrl(project.files?.original)} label="Original" accent="brand" /></div>
      </StepCard>
    );
  }
  return <DepositForm onCreated={onCreated} />;
}

function DepositForm({ onCreated }: { onCreated: (p: Project) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [src, setSrc] = useState<SourceLang>("yor");
  const [tgt, setTgt] = useState<TargetLang>("eng");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing: string[] = [];
  if (!title.trim()) missing.push("un titre");
  if (!artist.trim()) missing.push("le nom de l'artiste");
  if (!file) missing.push("un fichier audio");
  if (!consent) missing.push("le consentement");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length || !file) return;
    setSending(true);
    setError(null);
    try {
      const p = await api.createProject({ file, title: title.trim(), artist: artist.trim(), source_lang: src, target_lang: tgt, consent });
      onCreated(p);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <StepCard number={1} title="Dépôt" subtitle="Déposez un refrain de 15 à 40 secondes. L'artiste reste maître de sa voix : rien ne se fait sans son accord." error={error}>
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="label">Titre du morceau</label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Refrain démo" required />
          </div>
          <div>
            <label htmlFor="artist" className="label">Artiste</label>
            <input id="artist" className="field" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Nom de l'artiste" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="src" className="label">Langue chantée</label>
              <select id="src" className="field" value={src} onChange={(e) => setSrc(e.target.value as SourceLang)}>
                {SOURCE_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tgt" className="label">Langue cible</label>
              <select id="tgt" className="field" value={tgt} onChange={(e) => setTgt(e.target.value as TargetLang)}>
                {TARGET_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted"><span className="font-semibold text-gold-soft">Yorùbá en priorité.</span> Déjà pris en charge : Fon, Swahili.</p>
          {src === tgt && <p className="text-sm text-gold-soft">La langue cible est identique à la langue chantée.</p>}
        </div>
        <div className="space-y-4">
          <DropZone file={file} onFile={setFile} />
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${consent ? "border-mint/30 bg-mint/8" : "border-ink/10 bg-white/50"}`}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" required />
            <span className="text-sm">
              <span className="font-semibold">Je certifie être l'artiste ou disposer de son accord pour utiliser sa voix</span>
              <span className="mt-1 block text-muted">Obligatoire. Chaque version générée est une œuvre dérivée autorisée, signée par un filigrane.</span>
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <button type="submit" className="btn btn-primary px-6 py-3" disabled={!!missing.length || sending}>
            {sending ? <IconLoader size={16} /> : <IconCheck size={16} />}
            {sending ? "Envoi en cours..." : "Créer le projet"}
            {!sending && <IconArrowRight size={16} />}
          </button>
          {missing.length > 0 && <span className="text-sm text-muted">Il manque : {missing.join(", ")}.</span>}
        </div>
      </form>
    </StepCard>
  );
}
