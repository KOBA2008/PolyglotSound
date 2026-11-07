import type { StepProps } from "./shared";
import StepCard from "../../components/StepCard";
import AudioPlayer from "../../components/AudioPlayer";

export default function StepSeparate({ project, run, busy, errors, fileUrl }: StepProps) {
  const st = project.steps.separate;
  return (
    <StepCard
      number={2}
      title="Séparation"
      subtitle="On isole la voix de l'artiste et l'instrumentale d'origine, qui sera conservée telle quelle."
      state={st}
      onRun={() => void run("separate")}
      runLabel="Lancer la séparation"
      busy={busy === "separate"}
      error={errors.separate}
    >
      {project.mode === "demo" && (
        <p className="mb-4 rounded-xl border border-gold/25 bg-gold/8 p-3 text-sm text-gold-soft">
          Mode démo : séparation approximative par annulation de phase. Le worker GPU utilise Demucs pour une séparation studio.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <AudioPlayer src={fileUrl(project.files.original)} label="Original" accent="brand" />
        <AudioPlayer src={fileUrl(project.files.vocals)} label="Voix" accent="gold" download />
        <AudioPlayer src={fileUrl(project.files.instrumental)} label="Instrumentale" accent="teal" download />
      </div>
    </StepCard>
  );
}
