import { useState } from "react";
import { api, errMsg } from "../../api";
import type { StepProps } from "./shared";
import StepCard from "../../components/StepCard";
import AudioPlayer from "../../components/AudioPlayer";
import DropZone from "../../components/DropZone";
import Recorder from "../../components/Recorder";
import { IconLoader, IconMic, IconMusic, IconUpload, IconAlert } from "../../components/icons";

type SingMode = "studio" | "auto";

export default function StepSing({ project, setProject, run, busy, errors, fileUrl }: StepProps) {
  const st = project.steps.sing;
  const [mode, setMode] = useState<SingMode>("studio");
  const [file, setFile] = useState<File | null>(null);
  const [recorded, setRecorded] = useState<{ blob: Blob; ext: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const hasGuide = !!project.files.guide;
  const chosen = project.lines.filter((l) => l.chosen).length;

  const upload = async (blob: Blob, name: string) => {
    setUploading(true);
    setUpErr(null);
    try {
      const p = await api.uploadGuide(project.id, blob, name);
      setProject(p);
      setFile(null);
    } catch (e) {
      setUpErr(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  const modes: { k: SingMode; title: string; text: string; icon: typeof IconMic }[] = [
    { k: "studio", title: "Mode Studio", text: "Un chanteur guide. Meilleur rendu.", icon: IconMic },
    { k: "auto", title: "Mode Auto", text: "Sans chanteur. Calé sur la mélodie.", icon: IconMusic },
  ];

  return (
    <StepCard
      number={6}
      title="Chant"
      subtitle="La traduction chantée avec la voix de l'artiste."
      state={st}
      onRun={() => void run("sing", { mode })}
      runLabel="Lancer le chant"
      busy={busy === "sing"}
      error={errors.sing}
      runDisabled={mode === "studio" && !hasGuide}
    >
      {chosen < project.lines.length && project.lines.length > 0 && (
        <p className="mb-4 text-sm text-gold-soft">{project.lines.length - chosen} ligne(s) sans traduction · étape 5.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Mode de chant">
        {modes.map(({ k, title, text, icon: Icon }) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={mode === k}
            onClick={() => setMode(k)}
            className={`glass flex items-start gap-3 p-4 text-left transition ${mode === k ? "!border-brand-soft ring-2 ring-brand-soft/25" : "hover:brightness-[1.02]"}`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mode === k ? "grad" : "neo-inset"}`}><Icon size={18} /></span>
            <span>
              <span className="block font-display font-extrabold">{title}</span>
              <span className="mt-1 block text-sm text-muted">{text}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === "auto" && project.mode === "demo" && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-gold/25 bg-gold/8 p-3 text-sm text-gold-soft">
          <IconAlert size={16} className="mt-0.5 shrink-0" /> Mode Auto · worker GPU requis.
        </p>
      )}

      {mode === "studio" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-display font-extrabold">Voix guide</h3>
            <DropZone file={file} onFile={setFile} label="Glissez la voix guide chantée" />
            <button type="button" className="btn btn-primary" disabled={!file || uploading} onClick={() => file && void upload(file, file.name)}>
              {uploading ? <IconLoader size={16} /> : <IconUpload size={16} />} Envoyer la voix guide
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="font-display font-extrabold">Ou enregistrez ici</h3>
            <Recorder
              backing={fileUrl(project.files.instrumental)}
              onDone={(blob, ext) => {
                if (recorded) URL.revokeObjectURL(recorded.url);
                setRecorded({ blob, ext, url: URL.createObjectURL(blob) });
              }}
            />
            {recorded && (
              <div className="space-y-2">
                <AudioPlayer src={recorded.url} label="Prise micro" accent="flame" />
                <button type="button" className="btn btn-primary btn-sm" disabled={uploading} onClick={() => void upload(recorded.blob, `guide.${recorded.ext}`)}>
                  {uploading ? <IconLoader size={14} /> : <IconUpload size={14} />} Utiliser cette prise
                </button>
              </div>
            )}
            <LyricsPrompt lines={project.lines.map((l) => l.chosen || "")} />
          </div>
          {upErr && <p role="alert" className="text-sm text-flame-soft lg:col-span-2">{upErr}</p>}
          <div className="lg:col-span-2">
            <AudioPlayer src={fileUrl(project.files.guide)} label={hasGuide ? "Voix guide enregistrée" : "Voix guide (à déposer)"} accent="flame" />
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-2 font-display font-extrabold">Résultat</h3>
        <AudioPlayer src={fileUrl(project.files.sung)} label="Voix chantée" accent="gold" download />
      </div>
    </StepCard>
  );
}

function LyricsPrompt({ lines }: { lines: string[] }) {
  const has = lines.filter(Boolean);
  if (!has.length) return null;
  return (
    <div className="neo-inset rounded-xl p-3">
      <div className="label">Paroles à chanter</div>
      <ol className="space-y-1 text-sm">
        {lines.map((t, i) => <li key={i}><span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>{t || <em className="text-muted">non choisie</em>}</li>)}
      </ol>
    </div>
  );
}
