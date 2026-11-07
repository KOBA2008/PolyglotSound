import { useRef, useState } from "react";
import { IconUpload } from "./icons";

/** Zone de glisser-déposer pour un fichier audio. */
export default function DropZone({ file, onFile, label = "Glissez votre fichier audio ici", accept = "audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" }: {
  file: File | null; onFile: (f: File) => void; label?: string; accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? "border-brand bg-brand/8" : "border-ink/15 bg-white/45"}`}
    >
      <IconUpload size={28} className="text-brand-soft" />
      <div>
        <div className="font-semibold">{file ? file.name : label}</div>
        <div className="text-sm text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} Mo` : "WAV, MP3, M4A · 15 à 40 s"}</div>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
        {file ? "Changer de fichier" : "Parcourir"}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
