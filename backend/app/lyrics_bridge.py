"""Point d'entrée unique vers le moteur lyrics, avec repli si app.lyrics n'est pas prêt."""
from __future__ import annotations

try:
    from app.lyrics import adapt_line, count_syllables, llm_info, split_syllables
    LYRICS_FALLBACK = False
except ImportError:  # module en cours d'écriture par un autre chantier
    from app.lyrics_fallback import adapt_line, count_syllables, llm_info, split_syllables
    LYRICS_FALLBACK = True

__all__ = ["adapt_line", "count_syllables", "split_syllables", "llm_info", "LYRICS_FALLBACK"]
