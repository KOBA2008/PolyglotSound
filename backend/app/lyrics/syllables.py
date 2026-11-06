"""Compteur et découpeur de syllabes CHANTÉES pour fon, yorùbá, français, anglais.

Garantie centrale : ``count_syllables(text, lang) == len(split_syllables(text, lang))``
pour tout texte (le compte est défini comme la longueur du découpage).

Conventions (choisies pour le chant, pas pour la diction) :

Anglais (eng)
  * Si le paquet ``cmudict`` est installé, le compte d'un mot vient du dictionnaire
    CMU : on prend la prononciation qui a le MOINS de syllabes (les chanteurs
    choisissent la forme contractée : "fire" = 1, "every" = 2, "family" = 2,
    "hour" = 1). Quelques surcharges chantées (SUNG_OVERRIDES) priment.
  * Sinon, heuristique : groupes de voyelles (y voyelle hors début de mot),
    e muet final ("make"), "-le" syllabique après consonne ("table"),
    "-ed" muet sauf après t/d, "-es" muet sauf après s, x, z, ch, sh, c, g,
    hiatus ia/io/ua/uo (hors -tion, -sion, -cial, qu-...).
  * Le découpage est approximatif mais ajusté pour avoir exactement le compte.

Français (fra) : convention de la chanson
  * Chaque noyau vocalique = 1 syllabe ; ou, au, eau, ai, ei, oi, eu, œu, ui,
    ie, io, ion... = 1 seule (synérèse, usage chanté courant).
    Hiatus marqués par é/è/ê/ë/ï/ü après voyelle ("créé", "naïf", "Noël").
  * e muet final (mot de 2+ syllabes, "e" seul après consonne, terminaisons -e,
    -es, et -ent pour une liste de verbes courants) :
      - compté devant un mot commençant par une consonne ;
      - élidé (non compté) devant un mot commençant par une voyelle ou un h
        (le h est traité comme muet, simplification documentée) ;
        exception : -es et -ent restent comptés devant voyelle (liaison) ;
      - non compté en fin de vers (fin de ligne).
  * e après voyelle en fin de mot ("vie", "joie", "aimée", "rue") : jamais compté.
  * Monosyllabes en e (je, me, te, le, de, que, ce, ne, se) : 1 syllabe, sauf
    élision devant voyelle. Les formes élidées écrites ("t'", "l'", "qu'")
    ne comptent pas et se collent à la syllabe suivante.
  * "-ent" hors liste de verbes = voyelle nasale comptée ("moment", "souvent").

Fon (fon) et yorùbá (yor)
  * Normalisation NFD : les tons (accents aigu, grave, macron, caron, tilde) et
    le point souscrit (ẹ, ọ, ṣ) sont ignorés pour décider ; le texte rendu par
    le découpage garde les signes d'origine.
  * Chaque voyelle (a e ɛ i o ɔ u ; a e ẹ i o ọ u) = 1 noyau = 1 syllabe.
    Deux voyelles écrites côte à côte ("aa") = 2 syllabes (2 mores chantées).
  * n/m après voyelle et non suivi de voyelle = nasalisation (an, ɛn, in, ɔn,
    un) : pas de syllabe en plus.
  * n/m syllabique : mot isolé "n"/"m", n/m porteur d'un ton (ń, ǹ, ḿ), ou, en
    yorùbá, n/m en début de mot ou après consonne devant consonne ("mbá").
    "ny" (digramme) n'est jamais syllabique.
  * Digrammes consonantiques fon (gb, kp, ny, xw, hw...) : toutes les consonnes
    entre deux voyelles vont en attaque de la syllabe suivante (structure CV).
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

__all__ = ["count_syllables", "split_syllables", "normalize_lang"]

# ---------------------------------------------------------------------------
# Langues et tokenisation
# ---------------------------------------------------------------------------

_LANG_ALIASES = {
    "eng": "eng", "en": "eng", "english": "eng", "eng_latn": "eng", "anglais": "eng",
    "fra": "fra", "fr": "fra", "fre": "fra", "french": "fra", "fra_latn": "fra", "francais": "fra",
    "français": "fra",
    "fon": "fon", "fon_latn": "fon", "fongbe": "fon", "fɔngbe": "fon",
    "yor": "yor", "yo": "yor", "yoruba": "yor", "yorùbá": "yor", "yor_latn": "yor",
}

_APOS = "'’ʼ"


def normalize_lang(lang: str) -> str:
    """Ramène un code langue vers fon|yor|fra|eng (défaut : fon, compteur CV générique)."""
    return _LANG_ALIASES.get((lang or "").strip().lower(), "fon")


def _is_word_char(ch: str) -> bool:
    cat = unicodedata.category(ch)
    return cat[0] in ("L", "M")


def _tokenize(line: str) -> list[str]:
    """Mots = suites de lettres/diacritiques, apostrophe interne autorisée."""
    words: list[str] = []
    cur: list[str] = []
    for i, ch in enumerate(line):
        if _is_word_char(ch):
            cur.append(ch)
        elif ch in _APOS and cur and i + 1 < len(line) and _is_word_char(line[i + 1]):
            cur.append("'")
        else:
            if cur:
                words.append("".join(cur))
                cur = []
    if cur:
        words.append("".join(cur))
    return words


def _lines(text: str) -> list[str]:
    return [ln for ln in re.split(r"[\r\n]+", text or "") if ln.strip()]


def _fit(chunks: list[str], n: int) -> list[str]:
    """Ajuste une liste de morceaux pour en avoir exactement n (fusion / coupe)."""
    chunks = [c for c in chunks if c]
    if not chunks:
        return []
    total = sum(len(c) for c in chunks)
    n = max(1, min(n, total))
    while len(chunks) > n:
        # fusionne la paire adjacente la plus courte
        best = min(range(len(chunks) - 1), key=lambda i: len(chunks[i]) + len(chunks[i + 1]))
        chunks[best:best + 2] = [chunks[best] + chunks[best + 1]]
    while len(chunks) < n:
        best = max(range(len(chunks)), key=lambda i: len(chunks[i]))
        c = chunks[best]
        mid = len(c) // 2
        chunks[best:best + 1] = [c[:mid], c[mid:]]
    return chunks


def _cut(word: str, bounds: list[int]) -> list[str]:
    pts = [0] + sorted(set(b for b in bounds if 0 < b < len(word))) + [len(word)]
    return [word[a:b] for a, b in zip(pts, pts[1:]) if b > a]


# ---------------------------------------------------------------------------
# Anglais
# ---------------------------------------------------------------------------

# Surcharges "chantées" (priment sur CMU et l'heuristique).
SUNG_OVERRIDES: dict[str, int] = {
    "fire": 1, "fires": 1, "hour": 1, "hours": 1, "our": 1, "ours": 1,
    "every": 2, "family": 2, "heaven": 2, "evening": 2, "different": 2,
    "mama": 2, "papa": 2, "oh": 1, "ooh": 1, "yeah": 1, "la": 1, "na": 1,
}

_ENG_V = set("aeiouy")
_ENG_ONSETS = {
    "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr",
    "th", "sh", "ch", "ph", "wh", "wr", "kn", "sc", "sk", "sl", "sm", "sn", "sp", "st", "sw", "tw", "qu",
}


@lru_cache(maxsize=1)
def _cmu() -> dict | None:
    try:
        import cmudict  # type: ignore

        return cmudict.dict()
    except Exception:  # paquet absent ou données illisibles
        return None


def _eng_vowel_mask(w: str) -> list[bool]:
    mask = []
    for i, ch in enumerate(w):
        if ch in "aeiou":
            v = not (ch == "u" and i > 0 and w[i - 1] == "q")
        elif ch == "y":
            v = i > 0 and not (i + 1 < len(w) and w[i + 1] in "aeiou" and w[i - 1] not in "aeiou")
        else:
            v = False
        mask.append(v)
    return mask


def _eng_nuclei(w: str) -> list[tuple[int, int]]:
    mask = _eng_vowel_mask(w)
    groups: list[list[int]] = []
    for i, v in enumerate(mask):
        if v:
            if groups and groups[-1][1] == i:
                groups[-1][1] = i + 1
            else:
                groups.append([i, i + 1])
    # hiatus : ia, io, ua, uo (sauf -tion, -sion, -cial, -tial, -cious, -gion, qu...)
    out: list[list[int]] = []
    for a, b in groups:
        seg_start = a
        for k in range(a, b - 1):
            pair = w[k:k + 2]
            hiatus = pair in ("ia", "io", "ua", "uo", "eo") or (
                pair == "ea" and k + 2 == len(w)) or (pair == "ie" and w[k + 2:k + 3] == "t")
            if hiatus and not (k > 0 and w[k - 1] in "tscxg" and pair[0] == "i"):
                if pair == "eo" and w.startswith("peo"):
                    continue
                if pair[0] == "u" and k > 0 and w[k - 1] in "qg":
                    continue
                out.append([seg_start, k + 1])
                seg_start = k + 1
        out.append([seg_start, b])
    groups = out
    if len(groups) > 1:
        a, b = groups[-1]
        n = len(w)
        # e muet final
        if a == n - 1 and w[-1] == "e":
            is_le = n >= 3 and w[-2] == "l" and w[-3] not in "aeiouyl"
            if not is_le:
                groups.pop()
        # -ed / -es
        elif a == n - 2 and b == n - 1 and w[-2] == "e" and w[-1] in "ds":
            prev = w[-3] if n >= 3 else ""
            if w[-1] == "d":
                silent = prev not in "td"
            else:
                silent = prev not in "sxzcg" and not w.endswith(("ches", "shes"))
            if silent:
                groups.pop()
    return [(a, b) for a, b in groups]


def _eng_heuristic_split(w: str) -> list[str]:
    nuclei = _eng_nuclei(w)
    if not nuclei:
        return [w]
    bounds = []
    for (a1, b1), (a2, b2) in zip(nuclei, nuclei[1:]):
        cons = w[b1:a2]
        if len(cons) == 0:
            bounds.append(a2)
        elif len(cons) == 1:
            bounds.append(b1)
        elif cons[-2:] in _ENG_ONSETS and cons[-2:] not in ("ck", "ng"):
            bounds.append(a2 - 2)
        else:
            bounds.append(a2 - 1)
    return _cut(w, bounds)


def _eng_word_count(lw: str) -> int:
    if lw in SUNG_OVERRIDES:
        return SUNG_OVERRIDES[lw]
    d = _cmu()
    if d is not None and lw in d:
        counts = [sum(1 for ph in pron if ph[-1].isdigit()) for pron in d[lw]]
        if counts:
            return max(1, min(counts)) if any(counts) else 0
    return len(_eng_nuclei(lw))


def _eng_split(line: str) -> list[str]:
    out: list[str] = []
    for tok in _tokenize(line):
        word = tok.replace("'", "")
        lw = word.lower()
        if not lw:
            continue
        n = _eng_word_count(lw)
        if n == 0:
            if out:
                out[-1] += tok
            continue
        chunks = _eng_heuristic_split(lw)
        if len(word) == len(lw):  # on restitue la casse d'origine
            pos, restored = 0, []
            for c in chunks:
                restored.append(word[pos:pos + len(c)])
                pos += len(c)
            chunks = restored
        out.extend(_fit(chunks, n))
    return out


# ---------------------------------------------------------------------------
# Français
# ---------------------------------------------------------------------------

_FR_V = set("aeiouyàâäéèêëîïôöùûüœæ")
_FR_HIATUS = set("éèêëïü")  # ces voyelles ouvrent une nouvelle syllabe après une voyelle
_FR_ONSET2 = {a + b for a in "bcdfgkptv" for b in "lr"} | {"ch", "ph", "th", "gn", "qu", "gu"}
_FR_CLITICS = {"je", "me", "te", "se", "le", "de", "ne", "que", "ce"}
_FR_ENT_VERBS = {
    "aiment", "chantent", "dansent", "pleurent", "donnent", "disent", "prennent", "viennent",
    "tiennent", "restent", "passent", "parlent", "pensent", "rêvent", "portent", "marchent",
    "cherchent", "brillent", "tombent", "montent", "entendent", "attendent", "regardent",
    "chantaient", "pleuvent", "battent", "mettent", "laissent", "gardent", "gagnent", "travaillent",
    "appellent", "comptent", "doivent", "peuvent", "veulent", "savent", "vivent", "meurent",
    "naissent", "grandissent", "partent", "sortent", "dorment", "écoutent", "aident", "jouent",
}


def _fr_vowel_mask(w: str) -> list[bool]:
    mask = []
    for i, ch in enumerate(w):
        v = ch in _FR_V
        if v and ch == "u" and i > 0 and w[i - 1] in "qg":
            nxt = w[i + 1] if i + 1 < len(w) else ""
            if w[i - 1] == "q" or nxt in "eiéèêy":
                v = False
        if v and ch == "y" and i == 0 and len(w) > 1 and w[1] in _FR_V:
            v = False
        mask.append(v)
    return mask


def _fr_nuclei(w: str) -> list[list[int]]:
    mask = _fr_vowel_mask(w)
    groups: list[list[int]] = []
    for i, v in enumerate(mask):
        if v:
            if groups and groups[-1][1] == i and not (w[i] in _FR_HIATUS) and not (
                w[i - 1] == "é" and w[i] != "e"
            ):
                groups[-1][1] = i + 1
            else:
                groups.append([i, i + 1])
    return groups


def _fr_starts_with_vowel(word: str) -> bool:
    lw = word.lower().replace("'", "")
    return bool(lw) and (lw[0] in _FR_V or lw[0] == "h")


def _fr_word_split(tok: str, next_tok: str | None) -> list[str]:
    """Découpe un mot français dans son contexte (mot suivant, ou None = fin de vers)."""
    parts = tok.split("'")
    prefix = "'".join(parts[:-1]) + ("'" if len(parts) > 1 else "")
    core = parts[-1]
    lw = core.lower()
    if not lw:
        return [tok] if tok else []
    groups = _fr_nuclei(lw)
    if not groups:
        return [tok]
    n = len(lw)
    next_vowel = next_tok is not None and _fr_starts_with_vowel(next_tok)
    line_end = next_tok is None

    # e final après voyelle (vie, joie, aimée, rue, crient) : silencieux, déjà dans le groupe.
    a, b = groups[-1]
    drop_last = False
    if lw in _FR_CLITICS:
        drop_last = next_vowel
    elif len(groups) > 1 and b - a == 1 and lw[a] == "e":
        tail = lw[b:]
        if tail == "":
            drop_last = next_vowel or line_end
        elif tail == "s":
            drop_last = line_end
        elif tail == "nt" and lw in _FR_ENT_VERBS:
            drop_last = line_end
    if drop_last:
        groups = groups[:-1]
        if not groups:
            return [prefix + core]  # clitique élidé : se colle au mot suivant
    bounds = []
    for (a1, b1), (a2, b2) in zip(groups, groups[1:]):
        cons = lw[b1:a2]
        if len(cons) <= 1:
            bounds.append(b1 if cons else a2)
        elif cons[-2:] in _FR_ONSET2 and len(cons) >= 2:
            bounds.append(a2 - 2)
        else:
            bounds.append(a2 - 1)
    chunks = _cut(core, bounds) if len(core) == n else _cut(lw, bounds)
    chunks[0] = prefix + chunks[0]
    return chunks


def _fr_split(line: str) -> list[str]:
    toks = _tokenize(line)
    out: list[str] = []
    carry = ""
    for i, tok in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        chunks = _fr_word_split(tok, nxt)
        # un mot sans syllabe comptée (clitique élidé) se colle au mot suivant
        core = tok.split("'")[-1].lower()
        groups = _fr_nuclei(core) if core else []
        zero = (core in _FR_CLITICS and nxt is not None and _fr_starts_with_vowel(nxt)) or not groups
        if zero:
            carry += chunks[0] if chunks else tok
            continue
        if carry:
            chunks[0] = carry + chunks[0]
            carry = ""
        out.extend(chunks)
    if carry:
        if out:
            out[-1] += carry
        else:
            out.append(carry)
    return out


# ---------------------------------------------------------------------------
# Fon / yorùbá
# ---------------------------------------------------------------------------

_CV_VOWELS = set("aeiouɛɔəæ")
_TONE_MARKS = {"́", "̀", "̄", "̌", "̂"}


def _clusters(word: str) -> list[tuple[str, str]]:
    """Découpe en (lettre de base minuscule, signes combinants)."""
    out: list[list[str]] = []
    for ch in unicodedata.normalize("NFD", word):
        if unicodedata.combining(ch) and out:
            out[-1][1] += ch
        else:
            out.append([ch.lower(), ""])
    return [(b, m) for b, m in out]


def _cv_word_split(word: str, lang: str) -> list[str]:
    cl = _clusters(word.replace("'", ""))
    if not cl:
        return []
    bases = [b for b, _ in cl]
    is_v = [b in _CV_VOWELS for b in bases]
    nucleus = list(is_v)
    for i, (b, marks) in enumerate(cl):
        if b not in "nm":
            continue
        nxt_v = i + 1 < len(cl) and is_v[i + 1]
        prev_v = i > 0 and is_v[i - 1]
        if nxt_v:
            continue
        if b == "n" and i + 1 < len(cl) and bases[i + 1] == "y":
            continue  # digramme ny
        toned = any(m in _TONE_MARKS for m in marks)
        alone = len(cl) == 1
        if alone or (toned and not prev_v):
            nucleus[i] = True
        elif toned and prev_v and lang == "yor" and i + 1 < len(cl):
            nucleus[i] = True
        elif lang == "yor" and not prev_v and i + 1 < len(cl):
            nucleus[i] = True  # n/m syllabique devant consonne (mbá)
    idx = [i for i, v in enumerate(nucleus) if v]
    if not idx:
        return []
    # frontières : consonnes intervocaliques en attaque, sauf nasale coda
    bounds = []
    for k1, k2 in zip(idx, idx[1:]):
        start = k1 + 1
        if start < k2 and bases[start] in "nm" and is_v[k1] and not nucleus[start] and start + 1 <= k2 \
                and not (start + 1 < len(bases) and bases[start + 1] == "y"):
            # nasale coda (an, ɛn...) si suivie d'une consonne
            if start + 1 < k2 or not is_v[k2]:
                start += 1
        bounds.append(start)
    # reconstruit les chaînes en gardant les signes d'origine
    raw = [None] * len(cl)
    nfd = unicodedata.normalize("NFD", word.replace("'", ""))
    pos = 0
    for i in range(len(cl)):
        j = pos + 1
        while j < len(nfd) and unicodedata.combining(nfd[j]):
            j += 1
        raw[i] = nfd[pos:j]
        pos = j
    pts = [0] + bounds + [len(cl)]
    return [unicodedata.normalize("NFC", "".join(raw[a:b])) for a, b in zip(pts, pts[1:]) if b > a]


def _cv_split(line: str, lang: str) -> list[str]:
    out: list[str] = []
    for tok in _tokenize(line):
        chunks = _cv_word_split(tok, lang)
        if not chunks:  # mot sans noyau (ex. "hm") : collé à la syllabe précédente
            if out:
                out[-1] += tok
            continue
        out.extend(chunks)
    return out


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def split_syllables(text: str, lang: str) -> list[str]:
    """Découpe un texte (une ou plusieurs lignes) en syllabes chantées."""
    code = normalize_lang(lang)
    text = unicodedata.normalize("NFC", text or "")
    out: list[str] = []
    for line in _lines(text):
        if code == "eng":
            out.extend(_eng_split(line))
        elif code == "fra":
            out.extend(_fr_split(line))
        else:
            out.extend(_cv_split(line, code))
    return out


def count_syllables(text: str, lang: str) -> int:
    """Nombre de syllabes chantées (toujours égal à len(split_syllables(...)))."""
    return len(split_syllables(text, lang))
