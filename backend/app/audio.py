"""Outils audio basés sur ffmpeg (subprocess) + numpy. Fonctions synchrones :
les appeler via asyncio.to_thread depuis le code async."""
from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

from app.config import settings


class AudioError(Exception):
    pass


def _run(args: list[str]) -> bytes:
    try:
        proc = subprocess.run(args, capture_output=True, check=False)
    except FileNotFoundError as exc:
        raise AudioError("ffmpeg est introuvable sur la machine.") from exc
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise AudioError("Échec du traitement audio : " + " | ".join(tail))
    return proc.stdout


def _ff(*args: str) -> list[str]:
    return [settings.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *args]


def to_wav(src: Path, dst: Path, channels: int = 2, sr: int | None = None) -> Path:
    """Convertit n'importe quel audio en WAV PCM 16 bits 44,1 kHz."""
    _run(_ff("-i", str(src), "-vn", "-ac", str(channels), "-ar", str(sr or settings.sample_rate),
             "-c:a", "pcm_s16le", str(dst)))
    return dst


def duration(path: Path) -> float:
    out = _run([settings.ffprobe, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1", str(path)])
    try:
        return round(float(out.decode().strip()), 3)
    except ValueError as exc:
        raise AudioError("Durée du fichier audio illisible.") from exc


def channels(path: Path) -> int:
    out = _run([settings.ffprobe, "-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=channels", "-of", "default=nw=1:nk=1", str(path)])
    try:
        return int(out.decode().strip().splitlines()[0])
    except (ValueError, IndexError):
        return 1


def to_mono(src: Path, dst: Path) -> Path:
    return to_wav(src, dst, channels=1)


def phase_cancel(src: Path, dst: Path) -> Path:
    """Instrumentale approximative : L-R supprime ce qui est au centre (souvent la voix)."""
    _run(_ff("-i", str(src), "-af", "pan=mono|c0=0.5*c0-0.5*c1", "-ac", "2",
             "-ar", str(settings.sample_rate), "-c:a", "pcm_s16le", str(dst)))
    return dst


def cut(src: Path, dst: Path, start: float, end: float) -> Path:
    _run(_ff("-i", str(src), "-ss", f"{max(0.0, start):.3f}", "-to", f"{end:.3f}",
             "-c:a", "pcm_s16le", str(dst)))
    return dst


def mix(voice: Path, instrumental: Path, dst: Path,
        voice_vol: float = 1.0, instr_vol: float = 0.8) -> Path:
    """Mixe voix + instrumentale (durée la plus longue), limiteur pour éviter la saturation."""
    graph = (f"[0:a]aresample={settings.sample_rate},volume={voice_vol}[v];"
             f"[1:a]aresample={settings.sample_rate},volume={instr_vol}[i];"
             "[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[out]")
    _run(_ff("-i", str(voice), "-i", str(instrumental), "-filter_complex", graph,
             "-map", "[out]", "-ac", "2", "-ar", str(settings.sample_rate),
             "-c:a", "pcm_s16le", str(dst)))
    return dst


def to_mp3(src: Path, dst: Path, bitrate: str = "192k") -> Path:
    _run(_ff("-i", str(src), "-c:a", "libmp3lame", "-b:a", bitrate, str(dst)))
    return dst


def write_wav_bytes(data: bytes, dst: Path, channels: int = 2) -> Path:
    """Écrit un WAV reçu du worker puis le normalise en 44,1 kHz."""
    raw = dst.with_suffix(".raw.wav")
    raw.write_bytes(data)
    try:
        to_wav(raw, dst, channels=channels)
    finally:
        raw.unlink(missing_ok=True)
    return dst


def read_pcm(path: Path, sr: int = 16000) -> np.ndarray:
    """Lit l'audio en mono float32 via ffmpeg."""
    out = _run(_ff("-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"))
    return np.frombuffer(out, dtype=np.float32).copy()


def rms_energy(samples: np.ndarray, sr: int = 16000, hop: float = 0.01,
               win: float = 0.03) -> np.ndarray:
    """Énergie RMS par trame (pas = hop secondes)."""
    h = max(1, int(sr * hop))
    w = max(h, int(sr * win))
    if samples.size < w:
        return np.array([float(np.sqrt(np.mean(samples ** 2)))] if samples.size else [0.0])
    n = 1 + (samples.size - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    frames = samples[idx]
    return np.sqrt(np.mean(frames ** 2, axis=1)).astype(np.float32)


def is_silent(path: Path, threshold: float = 1e-3) -> bool:
    x = read_pcm(path, sr=8000)
    return x.size == 0 or float(np.sqrt(np.mean(x ** 2))) < threshold


def detect_segments(energy: np.ndarray, hop: float = 0.01, min_line: float = 1.2,
                    min_gap: float = 0.25, max_lines: int = 12) -> list[tuple[float, float]]:
    """Segments de voix par seuil d'énergie, fusion des segments courts ou trop proches."""
    total = len(energy) * hop
    if energy.size == 0 or float(energy.max()) <= 1e-6:
        return [(0.0, round(total, 2))] if total > 0 else []
    e = np.convolve(energy, np.ones(5) / 5, mode="same")  # lissage léger
    floor = float(np.percentile(e, 10))
    peak = float(np.percentile(e, 95))
    thr = floor + 0.25 * (peak - floor)
    active = e > thr
    segs: list[list[float]] = []
    start: int | None = None
    for i, a in enumerate(active):
        if a and start is None:
            start = i
        elif not a and start is not None:
            segs.append([start * hop, i * hop])
            start = None
    if start is not None:
        segs.append([start * hop, len(active) * hop])
    if not segs:
        return [(0.0, round(total, 2))]
    # Fusion des trous courts
    merged: list[list[float]] = [segs[0]]
    for s in segs[1:]:
        if s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    # Fusion des segments trop courts avec le voisin le plus proche
    changed = True
    while changed and len(merged) > 1:
        changed = False
        for i, s in enumerate(merged):
            if s[1] - s[0] < min_line:
                if i == 0:
                    j = 1
                elif i == len(merged) - 1:
                    j = i - 1
                else:
                    j = i - 1 if s[0] - merged[i - 1][1] <= merged[i + 1][0] - s[1] else i + 1
                a, b = sorted((i, j))
                merged[a] = [merged[a][0], merged[b][1]]
                del merged[b]
                changed = True
                break
    # Limite du nombre de lignes : fusion du plus petit trou
    while len(merged) > max_lines:
        gaps = [merged[i + 1][0] - merged[i][1] for i in range(len(merged) - 1)]
        k = int(np.argmin(gaps))
        merged[k] = [merged[k][0], merged[k + 1][1]]
        del merged[k + 1]
    # Petite marge autour de chaque ligne
    out: list[tuple[float, float]] = []
    for s, t in merged:
        out.append((round(max(0.0, s - 0.05), 2), round(min(total, t + 0.05), 2)))
    return out


def stress_from_energy(spans: list[tuple[float, float]], energy: np.ndarray,
                       hop: float) -> list[int]:
    """Indices des syllabes accentuées : pics locaux d'énergie, environ 1 sur 3, au moins 1."""
    n = len(spans)
    if n == 0:
        return []
    vals = []
    for s, t in spans:
        a, b = int(s / hop), max(int(s / hop) + 1, int(t / hop))
        seg = energy[a:b] if a < len(energy) else np.array([0.0])
        vals.append(float(seg.mean()) if seg.size else 0.0)
    v = np.array(vals)
    peaks = [i for i in range(n)
             if (i == 0 or v[i] >= v[i - 1]) and (i == n - 1 or v[i] >= v[i + 1])]
    target = max(1, round(n / 3))
    peaks.sort(key=lambda i: v[i], reverse=True)
    chosen: list[int] = []
    for i in peaks:  # évite deux accents collés
        if all(abs(i - c) > 1 for c in chosen):
            chosen.append(i)
        if len(chosen) >= target:
            break
    if not chosen:
        chosen = [int(np.argmax(v))]
    return sorted(chosen)
