"""Tests du moteur lyrics (compteur de syllabes + adaptation).

Note : les phrases fon / yorùbá ci-dessous sont des suites de syllabes de TEST,
construites pour exercer le compteur (digrammes, nasales, tons). Ce ne sont pas
des paroles réelles et elles ne prétendent pas avoir de sens.
"""

import asyncio
import os

import pytest

from app.lyrics import adapt_line, count_syllables, llm_info, split_syllables
from app.lyrics.adapt import stress_grid
from app.lyrics.llm import extract_json


# --- anglais -----------------------------------------------------------------

@pytest.mark.parametrize(
    "text,n",
    [
        ("Mama, you carried me through rain", 8),
        ("beautiful", 3),
        ("fire", 1),  # convention chantée : forme contractée (CMU F AY1 R)
        ("hour", 1),
        ("every", 2),
        ("table", 2),
        ("make", 1),
        ("loved", 1),
        ("wanted", 2),
        ("boxes", 2),
        ("I will always love you", 6),
        ("Twinkle twinkle little star", 7),
        ("Happy birthday to you", 6),
    ],
)
def test_english_counts(text, n):
    assert count_syllables(text, "eng") == n


# --- français ----------------------------------------------------------------

@pytest.mark.parametrize(
    "text,n",
    [
        ("Je t'aime encore", 4),          # je-t'ai-men-cor(e) : élision + e final de vers muet
        ("La vie est belle", 4),          # e final de vers non compté
        ("Une belle histoire", 5),        # u-ne (devant consonne) bel-l(e) (élision devant h) his-toir(e)
        ("Elles aiment le soleil", 7),    # -es et -ent comptés hors fin de vers
        ("Les enfants chantent", 4),      # -ent verbal muet en fin de vers
        ("Un moment pour toi", 5),        # -ent nasal compté
        ("Qu'il pleuve", 2),
        ("Maman tu m'as portée sous la pluie", 9),
    ],
)
def test_french_counts(text, n):
    assert count_syllables(text, "fra") == n


# --- fon / yorùbá ------------------------------------------------------------

def test_fon_tones_do_not_change_count():
    # syllabes de test (pas des paroles réelles)
    with_tones = "gbɛ̀ kpɔ́n nyɔ̀ xwé hwɛn ɖàxó"
    without = "gbɛ kpɔn nyɔ xwe hwɛn ɖaxo"
    assert count_syllables(with_tones, "fon") == 7
    assert count_syllables(without, "fon") == 7


def test_fon_digraphs_and_nasals():
    # gb, kp, ny, xw, hw restent en attaque ; an/ɛn/ɔn ne créent pas de syllabe
    assert split_syllables("agbakpanyɛn", "fon") == ["a", "gba", "kpa", "nyɛn"]
    assert count_syllables("xwɛ hwan", "fon") == 2


def test_yoruba_tones_and_syllabic_n():
    # syllabes de test (pas des paroles réelles)
    with_tones = "ọmọ ń lọ mbá"
    without = "omo n lo mba"
    assert count_syllables(with_tones, "yor") == 6
    assert count_syllables(without, "yor") == 6
    assert split_syllables(with_tones, "yor")[:2] == ["ọ", "mọ"]  # les tons sont conservés


@pytest.mark.parametrize("word,expected", [
    ("nakupenda", ["na", "ku", "pe", "nda"]),
    ("mtoto", ["m", "to", "to"]),
    ("kumpenda", ["ku", "m", "pe", "nda"]),
    ("mwana", ["mwa", "na"]),
    ("mbuzi", ["mbu", "zi"]),
    ("nchi", ["n", "chi"]),
    ("ndoto", ["ndo", "to"]),
    ("asante", ["a", "sa", "nte"]),
    ("kuimba", ["ku", "i", "mba"]),
    ("nyumba", ["nyu", "mba"]),
])
def test_swahili_split(word, expected):
    assert split_syllables(word, "swh") == expected


def test_swahili_line_and_aliases():
    assert count_syllables("Ninakupenda sana, mpenzi wangu", "swh") == 12
    assert count_syllables("asante", "sw") == count_syllables("asante", "swahili") == 3


@pytest.mark.parametrize("lang", ["fon", "yor", "swh", "fra", "eng"])
def test_count_equals_len_split(lang):
    phrases = [
        "Mama, you carried me through rain",
        "Je t'aime encore, la vie est belle",
        "gbɛ̀ kpɔ́n nyɔ̀ xwé hwɛn",
        "ọmọ ń lọ mbá ẹ̀",
        "strengths rhythm hmm",
        "Les belles amies chantent sous la pluie",
        "",
        "   ",
        "42 !!!",
        "créé naïf Noël guerre qu'il",
        "Ma-ma ma-ma, yeah",
    ]
    for p in phrases:
        assert count_syllables(p, lang) == len(split_syllables(p, lang)), (lang, p)


def test_multiline():
    assert count_syllables("La vie est belle\nJe t'aime encore", "fra") == 8


# --- utilitaires -------------------------------------------------------------

def test_stress_grid():
    assert stress_grid(8, [2, 5, 8]) == "da-DA-da-da-DA-da-da-DA"


def test_extract_json_tolerant():
    assert extract_json('Voici :\n```json\n{"variants": []}\n```') == {"variants": []}
    assert extract_json('blabla [1, 2] fin') == [1, 2]


# --- adaptation --------------------------------------------------------------

@pytest.fixture
def rule_provider(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "rule")


@pytest.mark.parametrize("lang,n,k", [("eng", 8, 3), ("fra", 6, 2), ("fon", 5, 4), ("yor", 3, 1), ("swh", 6, 3)])
def test_adapt_line_rule(rule_provider, lang, n, k):
    assert llm_info()["provider"] == "rule"
    res = asyncio.run(adapt_line("Maman, tu m'as portée sous la pluie", lang, n, [2, 5], n_variants=k))
    assert len(res) == k
    for r in res:
        assert set(r) == {"text", "syllables", "split", "ok"}
        assert r["syllables"] == count_syllables(r["text"], lang) == len(r["split"])
    assert all(r["ok"] for r in res)
    assert len({r["text"] for r in res}) == len(res)


def test_adapt_line_rule_empty_meaning(rule_provider):
    res = asyncio.run(adapt_line("", "eng", 4, n_variants=3))
    assert len(res) == 3 and res[0]["syllables"] == 4


@pytest.mark.skipif(
    not (os.getenv("GROQ_API_KEY") or os.getenv("ANTHROPIC_API_KEY")) or os.getenv("SKIP_LLM_TESTS"),
    reason="aucune clé LLM (GROQ_API_KEY / ANTHROPIC_API_KEY)",
)
def test_adapt_line_real_llm(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "auto")
    res = asyncio.run(adapt_line("Maman, tu m'as portée sous la pluie", "eng", 8, [1, 4, 6, 8], n_variants=3))
    assert len(res) == 3
    assert res[0]["syllables"] == count_syllables(res[0]["text"], "eng")
