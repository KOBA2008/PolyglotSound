import { useState, type FormEvent } from "react";
import { api, errMsg } from "../api";
import type { TargetLang, Variant } from "../types";
import { TARGET_LANGS } from "../types";
import SyllableGrid, { uniformCells } from "../components/SyllableGrid";
import VariantCard from "../components/VariantCard";
import Wave from "../components/Wave";
import { IconLoader, IconSparkle } from "../components/icons";

const EXAMPLES = [
  { meaning: "L'amour est une rivière qui ne tarit jamais", n: 8, stress: [0, 3, 6] },
  { meaning: "Ma mère m'a appris à me lever avant le soleil", n: 10, stress: [1, 4, 8] },
  { meaning: "Danse avec nous, la fête ne fait que commencer", n: 9, stress: [0, 2, 5, 8] },
];

export default function Atelier() {
  const [meaning, setMeaning] = useState("");
  const [text, setText] = useState("");
  const [lang, setLang] = useState<TargetLang>("eng");
  const [n, setN] = useState(8);
  const [stress, setStress] = useState<number[]>([0, 3, 6]);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const setCount = (v: number) => {
    setN(v);
    setStress((s) => s.filter((i) => i < v));
  };
  const toggle = (i: number) => setStress((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!meaning.trim()) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const r = await api.adapt({ meaning: meaning.trim(), text: text.trim() || undefined, target_lang: lang, n_syllables: n, stress_positions: stress, n_variants: 3 });
      setVariants(r.variants);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const ref = uniformCells(n, stress);

  return (
    <div className="space-y-8 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="kicker">Démo live</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-6xl">Proposez une <span className="grad-text">phrase</span></h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">Donnez un sens, un nombre de syllabes et des temps forts. PolyglotSound écrit des paroles qui tiennent dans la mesure.</p>
        </div>
        <Wave bars={24} height={56} />
      </header>

      <form onSubmit={submit} className="glass grid gap-6 p-5 md:p-7 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div>
            <label htmlFor="meaning" className="label">Le sens de la phrase</label>
            <textarea id="meaning" rows={3} className="field text-lg" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Ex. L'amour est une rivière qui ne tarit jamais" required />
          </div>
          <div>
            <label htmlFor="orig" className="label">Phrase originale (facultatif, en fon ou yorùbá)</label>
            <input id="orig" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Texte chanté d'origine" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-muted">Exemples :</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.meaning} type="button" className="btn btn-ghost btn-sm" onClick={() => { setMeaning(ex.meaning); setN(ex.n); setStress(ex.stress); }}>
                {ex.meaning.split(" ").slice(0, 4).join(" ")}...
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <span className="label" id="lang-l">Langue cible</span>
              <div className="inline-flex rounded-full border border-white/15 bg-black/30 p-1" role="radiogroup" aria-labelledby="lang-l">
                {TARGET_LANGS.map((l) => (
                  <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} onClick={() => setLang(l.code)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${lang === l.code ? "grad text-white" : "text-muted hover:text-white"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="n" className="label">Nombre de syllabes : <span className="font-display text-base text-white">{n}</span></label>
              <input id="n" type="range" min={4} max={16} value={n} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <div>
            <span className="label">Temps forts (cliquez sur les cases)</span>
            <SyllableGrid cells={ref} t0={0} t1={n} height={52} onToggle={toggle} label="Motif d'accents" />
            <p className="mt-2 text-xs text-muted">{stress.length} temps fort{stress.length > 1 ? "s" : ""} · positions {stress.length ? stress.map((i) => i + 1).join(", ") : "aucune"}</p>
          </div>
          <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={loading || !meaning.trim()}>
            {loading ? <IconLoader size={18} /> : <IconSparkle size={18} />} {loading ? "Écriture des variantes..." : "Adapter la phrase"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-red-200">{error}</p>}

      {variants && (
        <section aria-labelledby="var-h" aria-live="polite">
          <h2 id="var-h" className="mb-4 font-display text-2xl font-extrabold">Variantes · {variants.filter((v) => v.syllables === n).length}/{variants.length} au bon compte</h2>
          {variants.length === 0 && <p className="text-muted">Aucune variante renvoyée.</p>}
          <div className="grid gap-4 lg:grid-cols-3">
            {variants.map((v, i) => (
              <VariantCard key={i} index={i} variant={v} target={n} refCells={ref} t0={0} t1={n} selected={selected === i} onSelect={() => setSelected(i)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
