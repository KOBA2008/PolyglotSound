"""Modèles Pydantic : reprennent exactement le Project de docs/CONTRACT.md."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StepName = Literal["separate", "transcribe", "align", "translate", "sing", "finalize"]
STEP_NAMES: tuple[str, ...] = ("separate", "transcribe", "align", "translate", "sing", "finalize")
StepStatus = Literal["pending", "running", "done", "error"]
SourceLang = Literal["fon", "yor", "fra", "eng"]
TargetLang = Literal["eng", "fra", "fon"]
FILE_KEYS: tuple[str, ...] = ("original", "vocals", "instrumental", "guide", "sung", "final")


class Syllable(BaseModel):
    text: str
    start: float
    end: float
    stress: bool = False


class Variant(BaseModel):
    text: str
    syllables: int
    split: list[str] = Field(default_factory=list)
    ok: bool = False


class Line(BaseModel):
    index: int
    text: str = ""
    meaning: str = ""
    start: float
    end: float
    syllables: list[Syllable] = Field(default_factory=list)
    n_syllables: int = 0
    stress_positions: list[int] = Field(default_factory=list)
    variants: list[Variant] = Field(default_factory=list)
    chosen: str | None = None


class Step(BaseModel):
    status: StepStatus = "pending"
    message: str = ""
    progress: int = 0


class Files(BaseModel):
    original: str | None = None
    vocals: str | None = None
    instrumental: str | None = None
    guide: str | None = None
    sung: str | None = None
    final: str | None = None


class Pitch(BaseModel):
    hop: float
    f0: list[float]


class Watermark(BaseModel):
    applied: bool = False
    message: str | None = None


def _default_steps() -> dict[str, Step]:
    return {name: Step() for name in STEP_NAMES}


class Project(BaseModel):
    id: str
    title: str = ""
    artist: str = ""
    source_lang: SourceLang = "fon"
    target_lang: TargetLang = "eng"
    consent: bool = False
    created_at: str
    mode: Literal["demo", "live"] = "demo"
    duration: float = 0.0
    files: Files = Field(default_factory=Files)
    lines: list[Line] = Field(default_factory=list)
    pitch: Pitch | None = None
    steps: dict[str, Step] = Field(default_factory=_default_steps)
    watermark: Watermark = Field(default_factory=Watermark)


# --- Corps de requêtes ---

class LineEdit(BaseModel):
    index: int
    text: str | None = None
    meaning: str | None = None


class LinesBody(BaseModel):
    lines: list[LineEdit]


class Choice(BaseModel):
    index: int
    text: str | None = None


class ChoicesBody(BaseModel):
    choices: list[Choice]


class AdaptBody(BaseModel):
    text: str | None = None
    meaning: str = ""
    target_lang: TargetLang = "eng"
    n_syllables: int = Field(ge=1, le=64)
    stress_positions: list[int] | None = None
    n_variants: int = Field(default=3, ge=1, le=8)


class SyllablesBody(BaseModel):
    text: str
    lang: SourceLang = "fon"
