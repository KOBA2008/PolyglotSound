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
      subtitle="Chaque syllabe devient une case, aussi longue que la note chantée. En magenta, les temps forts : la traduction devra y placer ses accents."
      state={st}
      onRun={() => void run("align")}
      runLabel="Construire la grille"
      busy={busy === "align"}
      error={errors.align}
      runDisabled={!lines.length}
    >
      {!lines.length && <p className="text-muted">Il faut d'abord des lignes transcrites (étape 3).</p>}
      {missingText > 0 && (
        <p className="mb-4 rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm text-orange-200">
          {missingText} ligne{missingText > 1 ? "s n'ont" : " n'a"} pas encore de paroles : complétez-les à l'étape 3 puis reconstruisez la grille.
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
              <div key={k} className="rounded-xl bg-white/5 p-3">
                <div className="label">{k}</div>
                <div className="font-display text-2xl font-extrabold">{v}</div>
              </div>
            ))}
          </div>

          {/* Vue d'ensemble du morceau */}
          <div className="mb-8 rounded-2xl border border-white/10 bg-black/20 p-4">
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
                    className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border text-[11px] font-bold transition ${now !== null && now >= l.start && now < l.end ? "border-lime bg-lime/30" : "border-violet-soft/40 bg-violet/30"}`}
                    style={{ left: `${(l.start / duration) * 100}%`, width: `${((l.end - l.start) / duration) * 100}%` }}
                    title={l.text}
                  >
                    {l.index + 1}
                  </div>
                ))}
                {now !== null && <div className="absolute -top-16 bottom-0 w-0.5 bg-lime shadow-[0_0_10px_#a3e635]" style={{ left: `${(now / duration) * 100}%` }} />}
              </div>
            </div>
          </div>

          <ol className="space-y-5">
            {lines.map((l) => {
              const cells = cellsFromLine(l);
              const playing = player.active === l.index || player.active === FULL;
              return (
                <li key={l.index} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 md:p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => player.play(l.index, l.start, l.end)}
                      disabled={!player.available}
                      className="grad flex h-9 w-9 items-center justify-center rounded-full text-white"
                      aria-label={player.active === l.index ? `Arrêter la ligne ${l.index + 1}` : `Écouter la ligne ${l.index + 1}`}
                    >
                      {player.active === l.index ? <IconPause size={13} /> : <IconPlay size={13} />}
                    </button>
                    <span className="font-display text-sm font-extrabold text-violet-soft">Ligne {l.index + 1}</span>
                    <span className="font-display text-lg font-bold">{l.text || <em className="text-muted">sans paroles</em>}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                      <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono">{l.n_syllables} syllabes</span>
                      <span className="rounded-full bg-magenta/20 px-2 py-0.5 font-mono text-pink-200">{l.stress_positions?.length ?? 0} temps forts</span>
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
      <span className="flex items-center gap-2"><span className="h-4 w-6 rounded bg-gradient-to-b from-magenta to-[#a3167a]" /> Temps fort</span>
      <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-violet-soft/40 bg-violet/25" /> Temps faible</span>
      {pitch && <span className="flex items-center gap-2"><span className="h-1 w-6 rounded bg-gradient-to-r from-cyan via-lime to-orange" /> Mélodie de la voix (f0)</span>}
      <span className="flex items-center gap-2"><span className="h-4 w-0.5 bg-lime" /> Lecture en cours</span>
    </div>
  );
}
