import type { StepProps } from "./shared";
import { fmtSec } from "./shared";
import StepCard from "../../components/StepCard";
import SyllableGrid, { cellsFromLine, PitchCurve } from "../../components/SyllableGrid";
import { useSegmentPlayer } from "../../components/useSegmentPlayer";
import { IconPause, IconPlay } from "../../components/icons";

const FULL = -1;

export default function StepAlign({ project, run, busy, errors, fileUrl }: StepProps) {
  const st = project.steps.align;
  const lines = project.lines;
  const player = useSegmentPlayer(fileUrl(project.files.vocals ?? project.files.original));
  const missingText = lines.filter((l) => !l.text?.trim()).length;
  const duration = project.duration || (lines.length ? lines[lines.length - 1].end + 0.5 : 1);
  const aligned = st.status === "done" && lines.length > 0;
  const totalSyl = lines.reduce((a, l) => a + (l.n_syllables || 0), 0);
  const totalStress = lines.reduce((a, l) => a + (l.stress_positions?.length || 0), 0);
  const now = player.active !== null ? player.time : null;

  return (
    <StepCard
      number={4}
      title="Grille musicale"
      subtitle="Une case par syllabe. L'or marque les temps forts."
      state={st}
      onRun={() => void run("align")}
      runLabel="Construire la grille"
      busy={busy === "align"}
      error={errors.align}
      runDisabled={!lines.length}
    >
      {!lines.length && <p className="text-muted">Transcrivez d'abord les paroles (étape 3).</p>}
      {missingText > 0 && (
        <p className="mb-4 rounded-xl border border-gold/25 bg-gold/8 p-3 text-sm text-gold-soft">
          {missingText} ligne{missingText > 1 ? "s" : ""} sans paroles · complétez à l'étape 3.
        </p>
      )}

      {aligned && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            {[
              ["Lignes", lines.length],
              ["Syllabes", totalSyl],
              ["Temps forts", totalStress],
              ["Mélodie", project.pitch?.f0?.length ? "détectée" : "absente"],
            ].map(([k, v]) => (
              <div key={k} className="neo-inset rounded-xl p-3">
                <div className="label">{k}</div>
                <div className="font-display text-2xl font-extrabold">{v}</div>
              </div>
            ))}
          </div>

          {/* Vue d'ensemble du morceau */}
          <div className="neo-inset mb-8 rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display font-extrabold">Vue d'ensemble</h3>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!player.available} onClick={() => player.play(FULL, 0, duration)}>
                {player.active === FULL ? <IconPause size={12} /> : <IconPlay size={12} />} {player.active === FULL ? "Stop" : "Tout écouter"}
              </button>
            </div>
            <div className="relative h-24">
              {project.pitch?.f0?.length ? <PitchCurve pitch={project.pitch} t0={0} t1={duration} height={56} /> : null}
              <div className="absolute inset-x-0 bottom-0 h-8">
                {lines.map((l) => (
                  <div
                    key={l.index}
                    className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border text-[11px] font-bold transition ${now !== null && now >= l.start && now < l.end ? "border-brand bg-brand/15" : "border-brand/25 bg-brand/8"}`}
                    style={{ left: `${(l.start / duration) * 100}%`, width: `${((l.end - l.start) / duration) * 100}%` }}
                    title={l.text}
                  >
                    {l.index + 1}
                  </div>
                ))}
                {now !== null && <div className="absolute -top-16 bottom-0 w-0.5 bg-brand shadow-[0_0_0_2px_rgba(255,255,255,.7)]" style={{ left: `${(now / duration) * 100}%` }} />}
              </div>
            </div>
          </div>

          <ol className="space-y-5">
            {lines.map((l) => {
              const cells = cellsFromLine(l);
              const playing = player.active === l.index || player.active === FULL;
              return (
                <li key={l.index} className="neo-inset rounded-2xl p-4 md:p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => player.play(l.index, l.start, l.end)}
                      disabled={!player.available}
                      className="grad flex h-9 w-9 items-center justify-center rounded-full"
                      aria-label={player.active === l.index ? `Arrêter la ligne ${l.index + 1}` : `Écouter la ligne ${l.index + 1}`}
                    >
                      {player.active === l.index ? <IconPause size={13} /> : <IconPlay size={13} />}
                    </button>
                    <span className="font-display text-sm font-extrabold text-brand-soft">Ligne {l.index + 1}</span>
                    <span className="font-display text-lg font-bold">{l.text || <em className="text-muted">sans paroles</em>}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                      <span className="rounded-[9px] px-2 py-1 font-mono shadow-[var(--inset-sm)]">{l.n_syllables} syllabes</span>
                      <span className="rounded-[9px] px-2 py-1 font-mono text-gold-soft shadow-[var(--inset-sm)]">{l.stress_positions?.length ?? 0} temps forts</span>
                      <span className="font-mono">{fmtSec(l.start)} à {fmtSec(l.end)}</span>
                    </span>
                  </div>
                  {l.meaning && <p className="mb-3 text-sm italic text-muted">« {l.meaning} »</p>}
                  <SyllableGrid
                    cells={cells}
                    t0={l.start}
                    t1={l.end}
                    pitch={project.pitch?.f0?.length ? project.pitch : null}
                    currentTime={playing ? player.time : null}
                    height={52}
                    ticks
                    label={`Grille de la ligne ${l.index + 1}`}
                  />
                </li>
              );
            })}
          </ol>
          <Legend pitch={!!project.pitch?.f0?.length} />
        </>
      )}
    </StepCard>
  );
}

function Legend({ pitch }: { pitch: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted">
      <span className="flex items-center gap-2"><span className="h-4 w-6 rounded bg-gradient-to-b from-gold to-gold-soft" /> Temps fort</span>
      <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-brand/25 bg-brand/8" /> Temps faible</span>
      {pitch && <span className="flex items-center gap-2"><span className="h-1 w-6 rounded bg-gradient-to-r from-teal via-mint to-gold" /> Mélodie de la voix (f0)</span>}
      <span className="flex items-center gap-2"><span className="h-4 w-0.5 bg-brand" /> Lecture en cours</span>
    </div>
  );
}
