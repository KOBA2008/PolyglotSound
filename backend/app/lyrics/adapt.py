"""Adaptation chantée d'une ligne : un LLM génère, notre compteur vérifie, on régénère.

adapt_line(...) -> list[{"text", "syllables", "split", "ok"}], trié ok d'abord puis écart minimal.
"""

from __future__ import annotations

import logging
import re
import unicodedata

from .llm import LLMError, chat_json, resolve_provider
from .syllables import count_syllables, normalize_lang, split_syllables

log = logging.getLogger("polyglotsound.lyrics")

MAX_ROUNDS = 4

LANG_NAMES = {"eng": "English", "fra": "French", "fon": "Fon (Fɔngbe, Benin)", "yor": "Yoruba", "swh": "Swahili (Kiswahili)"}

SYSTEM_PROMPT = """You are an expert lyricist specialised in SINGABLE song translation (like adapting a musical or a pop song into another language).
You receive the meaning of one sung line, the original line, and a rhythmic grid. You write new lyrics in the target language.

Hard rules:
1. Each line must have EXACTLY the requested number of SUNG syllables, one syllable per note. Count carefully, syllable by syllable, before answering.
2. Keep the meaning and the emotion of the original. A close paraphrase is better than a literal translation that does not fit.
3. Put strong, naturally stressed syllables (important words, stressed syllables of words) on the positions marked DA in the grid; weak syllables (articles, prepositions, unstressed endings) on "da".
4. Natural, idiomatic, singable language with open vowels on long notes when possible. No absurd filler, no padding with "oh yeah" unless the original style does so.
5. Each variant must be different (word choice, structure).

Answer with STRICT JSON only, no prose, no markdown:
{"variants":[{"text":"...", "syllables_split":["syl","la","ble"]}]}"""


def stress_grid(n: int, stress_positions: list[int] | None) -> str:
    """Grille visuelle : positions 1-indexées de stress_positions en DA."""
    stress = set()
    for p in stress_positions or []:
        try:
            p = int(p)
        except (TypeError, ValueError):
            continue
        # tolère 0-indexé : si 0 présent, on décale
        stress.add(p)
    if 0 in stress:
        stress = {p + 1 for p in stress}
    return "-".join("DA" if i in stress else "da" for i in range(1, n + 1))


def _clean(text: str) -> str:
    t = str(text or "").strip().strip('"“”«»').strip()
    t = re.sub(r"\s+", " ", t)
    return t.replace("\u2014", ", ").replace("\u2013", ", ")


def _key(text: str) -> str:
    t = unicodedata.normalize("NFC", text).lower()
    return re.sub(r"[^\w]+", " ", t).strip()


def _evaluate(text: str, lang: str, n: int) -> dict:
    split = split_syllables(text, lang)
    return {"text": text, "syllables": len(split), "split": split, "ok": len(split) == n}


def _rank(results: list[dict], n: int) -> list[dict]:
    order = {id(r): i for i, r in enumerate(results)}
    return sorted(results, key=lambda r: (not r["ok"], abs(r["syllables"] - n), order[id(r)]))


# ---------------------------------------------------------------------------
# Fournisseur "rule" : déterministe, hors ligne
# ---------------------------------------------------------------------------

_FILLERS = {
    # mots courts monosyllabiques et neutres (pas de e muet en français)
    "eng": [["oh"], ["so"], ["my", "love"], ["now"], ["la"]],
    "fra": [["oh"], ["toi"], ["mon", "cœur"], ["là"], ["la"]],
    "fon": [["o"], ["a"], ["la"], ["ɛ"]],
    "yor": [["o"], ["a"], ["la"], ["ẹ"]],
    "swh": [["o"], ["a"], ["la"], ["ee"]],
}


def _rule_build(words: list[str], lang: str, n: int, filler_seq: list[str], prefix: bool) -> str:
    """Prend des mots du sens tant que ça rentre, complète avec des monosyllabes."""
    line: list[str] = []
    for w in words:
        cand = line + [w]
        if count_syllables(" ".join(cand), lang) <= n:
            line = cand
    fi = 0
    guard = 0
    while count_syllables(" ".join(line), lang) < n and guard < 4 * n + 8:
        f = filler_seq[fi % len(filler_seq)]
        fi += 1
        guard += 1
        cand = [f] + line if prefix else line + [f]
        if count_syllables(" ".join(cand), lang) <= n:
            line = cand
    # dernier recours : retirer des mots si le contexte (élisions) a fait déborder
    while line and count_syllables(" ".join(line), lang) > n:
        line = line[1:] if prefix else line[:-1]
    return " ".join(line)


def rule_variants(meaning: str, target_lang: str, n_syllables: int, n_variants: int = 3) -> list[dict]:
    lang = normalize_lang(target_lang)
    n = max(0, int(n_syllables))
    words = [w for w in re.findall(r"[^\s]+", meaning or "") if re.search(r"\w", w)]
    words = [w.strip(",.;:!?\"“”«»()") for w in words]
    words = [w for w in words if w]
    fillers = _FILLERS.get(lang, _FILLERS["fon"])
    flat = [w for grp in fillers for w in grp]
    strategies = [
        (words, flat, False),
        (words, flat, True),
        (list(reversed(words)), list(reversed(flat)), False),
        (words[1:] + words[:1], flat[1:] + flat[:1], False),
        (words[::2] + words[1::2], flat, True),
    ]
    out: list[dict] = []
    seen: set[str] = set()
    for i in range(max(n_variants * 3, len(strategies))):
        ws, fs, pre = strategies[i % len(strategies)]
        if i >= len(strategies):
            shift = i // len(strategies)
            fs = fs[shift % len(fs):] + fs[:shift % len(fs)]
            ws = ws[shift % max(1, len(ws)):] + ws[:shift % max(1, len(ws))]
        text = _rule_build(ws, lang, n, fs, pre) if n > 0 else ""
        k = _key(text)
        if k in seen:
            continue
        seen.add(k)
        out.append(_evaluate(text, lang, n))
        if len(out) >= n_variants:
            break
    while len(out) < n_variants and out:  # aucun texte distinct de plus : on duplique la meilleure
        out.append(dict(out[0]))
    return _rank(out, n)[:n_variants]


# ---------------------------------------------------------------------------
# Boucle LLM
# ---------------------------------------------------------------------------

def _user_prompt(meaning, lang, n, grid, source_text, context, k, feedback) -> str:
    parts = [
        f"Target language: {LANG_NAMES.get(lang, lang)}",
        f"Meaning of the line: {meaning}",
    ]
    if source_text:
        parts.append(f"Original sung line (Fon/source): {source_text}")
    if context:
        parts.append(f"Song context (neighbouring lines, theme): {context}")
    parts.append(f"Required sung syllables: EXACTLY {n}")
    parts.append(f"Rhythmic grid (one block per note, DA = stressed beat): {grid}")
    parts.append(f"Give {k} different variants.")
    if feedback:
        parts.append(
            "Your previous attempts were checked by a syllable counter. Fix them and propose new ones.\n"
            + "\n".join(feedback)
        )
    return "\n".join(parts)


def _parse_variants(data) -> list[str]:
    items = []
    if isinstance(data, dict):
        items = data.get("variants") or data.get("lines") or data.get("results") or []
        if not items and "text" in data:
            items = [data]
    elif isinstance(data, list):
        items = data
    texts = []
    for it in items:
        if isinstance(it, str):
            texts.append(_clean(it))
        elif isinstance(it, dict):
            t = it.get("text") or it.get("line") or ""
            if t:
                texts.append(_clean(t))
    return [t for t in texts if t]


async def adapt_line(
    meaning: str,
    target_lang: str,
    n_syllables: int,
    stress_positions: list[int] | None = None,
    source_text: str = "",
    n_variants: int = 3,
    context: str = "",
) -> list[dict]:
    """Renvoie n_variants adaptations chantables, triées : ok d'abord, puis écart minimal."""
    lang = normalize_lang(target_lang)
    n = max(0, int(n_syllables))
    n_variants = max(1, int(n_variants))
    meaning = (meaning or source_text or "").strip()
    provider = resolve_provider()
    if provider == "rule" or n == 0:
        return rule_variants(meaning, lang, n, n_variants)

    grid = stress_grid(n, stress_positions)
    results: list[dict] = []
    seen: set[str] = set()
    feedback: list[str] = []
    for rnd in range(MAX_ROUNDS):
        n_ok = sum(r["ok"] for r in results)
        if n_ok >= n_variants:
            break
        k = max(2, n_variants - n_ok + 2)
        try:
            data = await chat_json(
                SYSTEM_PROMPT,
                _user_prompt(meaning, lang, n, grid, source_text, context, k, feedback),
                temperature=0.7 + 0.1 * rnd,
                provider=provider,
            )
        except LLMError as e:
            log.warning("adapt_line : %s ; repli sur le mode rule", e)
            break
        new_bad = []
        for text in _parse_variants(data):
            key = _key(text)
            if not key or key in seen:
                continue
            seen.add(key)
            ev = _evaluate(text, lang, n)
            results.append(ev)
            if not ev["ok"]:
                new_bad.append(ev)
        feedback = [
            f'- "{ev["text"]}" has {ev["syllables"]} syllables ({"-".join(ev["split"])}), '
            f"it needs exactly {n}: {'remove' if ev['syllables'] > n else 'add'} "
            f"{abs(ev['syllables'] - n)}."
            for ev in new_bad[:6]
        ]
        ok_texts = [r["text"] for r in results if r["ok"]]
        if ok_texts:
            feedback.append("Already accepted (do not repeat): " + " | ".join(f'"{t}"' for t in ok_texts))

    ranked = _rank(results, n)
    if len(ranked) < n_variants:
        extra = [r for r in rule_variants(meaning, lang, n, n_variants) if _key(r["text"]) not in seen]
        ranked = _rank(ranked + extra, n)
    return ranked[:n_variants]
