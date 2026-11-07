"""Repli minimal du moteur lyrics (utilisé seulement si app.lyrics est absent).
Compte les groupes de voyelles ; adapt_line renvoie des variantes ajustées mécaniquement."""
from __future__ import annotations

import re
import unicodedata

_VOWELS = set("aeiouyàâäéèêëîïôöùûüœæɛɔɩʋ")


def _is_vowel(ch: str) -> bool:
    base = unicodedata.normalize("NFD", ch.lower())[0]
    return ch.lower() in _VOWELS or base in _VOWELS


def _split_word(word: str) -> list[str]:
    """Découpe en (consonnes)voyelles ; une consonne isolée entre voyelles ouvre la syllabe suivante."""
    sylls: list[str] = []
    cur = ""
    prev_vowel = False
    for ch in word:
        v = _is_vowel(ch)
        if v and not prev_vowel and any(_is_vowel(c) for c in cur):
            tail = cur[-1] if not _is_vowel(cur[-1]) else ""
            sylls.append(cur[: len(cur) - len(tail)])
            cur = tail
        cur += ch
        prev_vowel = v
    if cur:
        if sylls and not any(_is_vowel(c) for c in cur):
            sylls[-1] += cur
        else:
            sylls.append(cur)
    return [s for s in sylls if s]


def split_syllables(text: str, lang: str = "fon") -> list[str]:
    out: list[str] = []
    for w in re.findall(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", text or ""):
        out.extend(_split_word(w))
    return out


def count_syllables(text: str, lang: str = "fon") -> int:
    return len(split_syllables(text, lang))


_FILLERS = {"eng": ["oh", "yeah", "my", "love"], "fra": ["oh", "mon", "doux", "cœur"],
            "fon": ["o", "ɛ", "mɛ", "ji"],
            "yor": ["o", "ẹ", "a", "la"], "swh": ["o", "a", "la", "ee"]}


async def adapt_line(meaning: str, target_lang: str, n_syllables: int,
                     stress_positions: list[int] | None = None, source_text: str = "",
                     n_variants: int = 3, context: str = "") -> list[dict]:
    words = (meaning or source_text or "").split()
    fillers = _FILLERS.get(target_lang, _FILLERS["eng"])
    variants: list[dict] = []
    for k in range(max(1, n_variants)):
        cur = list(words)
        i = k
        while count_syllables(" ".join(cur), target_lang) < n_syllables:
            cur.append(fillers[i % len(fillers)])
            i += 1
        while len(cur) > 1 and count_syllables(" ".join(cur), target_lang) > n_syllables:
            cur.pop()
        while count_syllables(" ".join(cur), target_lang) < n_syllables:  # remplissage final
            cur.append(fillers[i % len(fillers)])
            i += 1
        text = " ".join(cur)
        split = split_syllables(text, target_lang)
        variants.append({"text": text, "syllables": len(split), "split": split,
                         "ok": len(split) == n_syllables})
    variants.sort(key=lambda v: not v["ok"])
    return variants


def llm_info() -> dict:
    return {"provider": "fallback", "model": None}
