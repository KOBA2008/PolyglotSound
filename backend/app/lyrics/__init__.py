"""Moteur lyrics PolyglotSound : compteur de syllabes chantées + adaptation par LLM sous contrainte."""

from .adapt import adapt_line
from .llm import llm_info
from .syllables import count_syllables, split_syllables

__all__ = ["count_syllables", "split_syllables", "adapt_line", "llm_info"]
