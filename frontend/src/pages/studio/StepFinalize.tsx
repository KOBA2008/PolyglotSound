import type { StepProps } from "./shared";
import StepCard from "../../components/StepCard";
import ABPlayer from "../../components/ABPlayer";
import { IconDownload, IconShield, IconAlert } from "../../components/icons";

export default function StepFinalize({ project, run, busy, errors, fileUrl }: StepProps) {
  const st = project.steps.finalize;
  const final = project.files.final;
  const mp3 = project.files["final_mp3"] ?? (final ? final.replace(/\.wav$/i, ".mp3") : null);
  const wm = project.watermark ?? { applied: false, message: null };
  const done = st.status === "done" && !!final;
  const slug = (project.title || "polyglotsound").replace(/[^\p{L}\p{N}]+/gu, "_");

  return (
    <StepCard
      number={7}
      title="Version finale"
      subtitle="Mixage de la voix chantée sur l'instrumentale d'origine, signé par un filigrane AudioSeal inaudible."
      state={st}
      onRun={() => void run("finalize")}
      runLabel="Finaliser"
      busy={busy === "finalize"}
      error={errors.finalize}
      runDisabled={project.steps.sing.status !== "done"}
    >
      {project.steps.sing.status !== "done" && <p className="mb-4 text-sm text-muted">Il faut d'abord la voix chantée (étape 6).</p>}
      <ABPlayer a={fileUrl(project.files.original)} b={done ? fileUrl(final) : null} />
      {done && (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {wm.applied ? (
            <span className="inline-flex items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold text-mint shadow-[var(--inset-sm)]">
              <IconShield size={16} /> Filigrane AudioSeal appliqué{wm.message ? ` · ${wm.message}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold text-gold-soft shadow-[var(--inset-sm)]">
              <IconAlert size={16} /> Filigrane non appliqué{project.mode === "demo" ? " (mode démo, worker GPU requis)" : ""}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <a className="btn btn-primary" href={final!} download={`${slug}_polyglotsound.wav`}><IconDownload size={16} /> WAV</a>
            {mp3 && <a className="btn btn-ghost" href={mp3} download={`${slug}_polyglotsound.mp3`}><IconDownload size={16} /> MP3</a>}
          </div>
        </div>
      )}
    </StepCard>
  );
}
