const CHARS = ["ẹ", "ọ", "ṣ", "à", "á", "è", "é", "ì", "í", "ò", "ó", "ù", "ú", "ẹ̀", "ẹ́", "ọ̀", "ọ́", "ń"];

/** Clavier de caractères yorùbá : insère au curseur sans voler le focus du champ. */
export default function YorubaKeyboard({ onInsert, label = "Clavier yorùbá" }: { onInsert: (ch: string) => void; label?: string }) {
  return (
    <div className="neo-inset mt-2 rounded-xl p-2.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
        <span className="text-[11px] text-muted/80">insère au curseur</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {CHARS.map((ch) => (
          <button
            key={ch}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(ch)}
            aria-label={`Insérer ${ch}`}
            className="neo-chip flex h-10 min-w-10 items-center justify-center rounded-lg px-1 text-[15px] font-semibold text-ink transition hover:text-brand-soft hover:ring-1 hover:ring-brand/30 active:shadow-[inset_2px_2px_5px_rgba(163,177,198,.55)]"
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}
