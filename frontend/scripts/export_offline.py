"""Exporte des projets locaux (backend/data/<id>/) vers frontend/public/offline/ pour le mode démo hors ligne.

Usage (depuis la racine du dépôt ou n'importe où) :
    python frontend/scripts/export_offline.py [id1 id2 ...]

- Copie project.json (URLs réécrites vers /offline/<id>/...) et une liste ordonnée projects.json.
- Convertit uniquement les fichiers audio utilisés par l'interface en MP3 160 kbps (ffmpeg).
- ATTENTION : le dossier généré contient des chansons protégées et des voix clonées.
  Il est ignoré par git (voir .gitignore) et ne doit JAMAIS être commité.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
REPO = FRONTEND.parent
DATA = Path(os.getenv("DATA_DIR") or (REPO / "backend" / "data"))
OUT = FRONTEND / "public" / "offline"

# Ordre d'affichage : le premier est mis en avant sur l'accueil.
DEFAULT_IDS = ["79f842", "e1852b", "1ea841", "0b1cb4"]
# Pistes lues par l'interface (StepDeposit/Separate/Sing/Finalize, LyricsPlayer, ABPlayer).
AUDIO_KEYS = ["original", "vocals", "instrumental", "guide", "sung", "final"]
BITRATE = os.getenv("OFFLINE_BITRATE", "160k")

FFMPEG_DEFAULT = (
    r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
)


def find_ffmpeg() -> str:
    env = os.getenv("FFMPEG")
    if env:
        return env
    if Path(FFMPEG_DEFAULT).exists():
        return FFMPEG_DEFAULT
    found = shutil.which("ffmpeg")
    if not found:
        sys.exit("ffmpeg introuvable : définissez la variable FFMPEG.")
    return found


def to_mp3(ffmpeg: str, src: Path, dst: Path) -> None:
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-map_metadata", "-1", "-vn", "-ac", "2", "-ar", "44100",
         "-codec:a", "libmp3lame", "-b:a", BITRATE, str(dst)],
        check=True,
    )


def export_project(ffmpeg: str, pid: str) -> dict:
    src_dir = DATA / pid
    project = json.loads((src_dir / "project.json").read_text(encoding="utf-8"))
    out_dir = OUT / pid
    out_dir.mkdir(parents=True, exist_ok=True)

    files: dict[str, str | None] = {k: None for k in AUDIO_KEYS}
    for key in AUDIO_KEYS:
        url = (project.get("files") or {}).get(key)
        if not url:
            continue
        src = src_dir / Path(url.split("?")[0]).name
        if not src.exists():
            print(f"  [{pid}] {key} : fichier absent ({src.name}), ignoré")
            continue
        dst = out_dir / f"{key}.mp3"
        to_mp3(ffmpeg, src, dst)
        files[key] = f"/offline/{pid}/{key}.mp3"
    if files["final"]:
        files["final_mp3"] = files["final"]
    project["files"] = files
    (out_dir / "project.json").write_text(json.dumps(project, ensure_ascii=False), encoding="utf-8")

    # Résumé pour la liste (sans paroles ni courbe de hauteur)
    summary = {k: v for k, v in project.items() if k not in ("lines", "pitch")}
    summary["lines"] = []
    return summary


def main() -> None:
    ids = sys.argv[1:] or DEFAULT_IDS
    ffmpeg = find_ffmpeg()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    summaries = []
    for pid in ids:
        print(f"Export {pid}...")
        summaries.append(export_project(ffmpeg, pid))
    (OUT / "projects.json").write_text(json.dumps(summaries, ensure_ascii=False), encoding="utf-8")
    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"OK : {len(summaries)} projets, {total / 1e6:.1f} Mo dans {OUT}")


if __name__ == "__main__":
    main()
