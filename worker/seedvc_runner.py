"""Lance inference.py de Seed-VC avec des correctifs de compatibilité.

Usage :
  python seedvc_runner.py <SEEDVC_DIR> --source ... --target ... --output ... [args inference.py]
      exécution unique (recharge les modèles à chaque fois)
  python seedvc_runner.py <SEEDVC_DIR> --daemon
      mode démon : charge les modèles UNE fois (mode chant, f0 conditionné), puis lit sur stdin une
      requête JSON par ligne {source, target, output, diffusion_steps, semi_tone_shift,
      auto_f0_adjust, inference_cfg_rate, length_adjust} et répond sur stdout par une ligne
      "@@RESULT {json}" ({"ok": true, "output": chemin} ou {"ok": false, "error": ...}).
      Une ligne "@@READY" est émise quand les modèles sont chargés.

Correctifs appliqués avant d'exécuter inference.py (sans modifier le dépôt cloné) :
1. torchaudio >= 2.9 délègue torchaudio.save à TorchCodec (souvent absent) : on remplace
   torchaudio.save par une écriture soundfile.
2. huggingface_hub >= 1.0 n'envoie plus `proxies` ni `resume_download` à
   ModelHubMixin._from_pretrained, alors que BigVGAN (modules/bigvgan) les exige :
   on fournit des valeurs par défaut et on filtre les arguments refusés par hf_hub_download.
3. torch >= 2.6 charge par défaut avec weights_only=True : le worker exporte
   TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1 (checkpoints officiels de confiance).
"""
import inspect
import json
import os
import runpy
import sys


def _patch_torchaudio_save() -> None:
    import numpy as np
    import soundfile as sf
    import torchaudio

    def _save(uri, src, sample_rate, *args, **kwargs):
        x = src.detach().cpu().float().numpy() if hasattr(src, "detach") else np.asarray(src, dtype=np.float32)
        channels_first = kwargs.get("channels_first", True)
        if x.ndim == 2 and channels_first:
            x = x.T
        sf.write(str(uri), np.clip(x, -1.0, 1.0), int(sample_rate), subtype="PCM_16")

    torchaudio.save = _save


def _filtered(fn):
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return fn
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return fn

    def wrapper(*args, **kwargs):
        return fn(*args, **{k: v for k, v in kwargs.items() if k in params})

    return wrapper


def _patch_bigvgan() -> None:
    try:
        import modules.bigvgan.bigvgan as bv
    except Exception as exc:  # le dépôt a peut-être changé : on laisse inference.py échouer proprement
        print(f"[seedvc_runner] patch BigVGAN ignoré : {exc}", file=sys.stderr)
        return
    if hasattr(bv, "hf_hub_download"):
        bv.hf_hub_download = _filtered(bv.hf_hub_download)
    orig = bv.BigVGAN.__dict__.get("_from_pretrained")
    if isinstance(orig, classmethod):
        func = orig.__func__

        def _from_pretrained(cls, **kwargs):
            kwargs.setdefault("proxies", None)
            kwargs.setdefault("resume_download", False)
            return func(cls, **kwargs)

        bv.BigVGAN._from_pretrained = classmethod(_from_pretrained)


def _emit(tag: str, payload=None) -> None:
    line = tag if payload is None else f"{tag} {json.dumps(payload, ensure_ascii=False)}"
    sys.__stdout__.write(line + "\n")
    sys.__stdout__.flush()


def daemon(script: str) -> None:
    import argparse
    import glob
    import importlib.util
    import traceback

    # Les print() de Seed-VC partent sur stderr : stdout reste réservé au protocole.
    sys.stdout = sys.stderr
    spec = importlib.util.spec_from_file_location("seedvc_inference", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # n'exécute pas le bloc __main__

    base = dict(diffusion_steps=30, length_adjust=1.0, inference_cfg_rate=0.7, f0_condition=True,
                auto_f0_adjust=False, semi_tone_shift=0, checkpoint=None, config=None, fp16=True)
    cached = mod.load_models(argparse.Namespace(**base))
    mod.load_models = lambda _args: cached  # main() réutilise les modèles chargés
    _emit("@@READY")
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
            params = dict(base)
            params.update({k: req[k] for k in base if k in req and req[k] is not None})
            params["f0_condition"] = True
            params.update(source=req["source"], target=req["target"], output=req["output"])
            os.makedirs(params["output"], exist_ok=True)
            mod.main(argparse.Namespace(**params))
            wavs = sorted(glob.glob(os.path.join(params["output"], "*.wav")), key=os.path.getmtime)
            if not wavs:
                raise RuntimeError("aucun fichier WAV produit")
            _emit("@@RESULT", {"ok": True, "output": wavs[-1]})
        except Exception as exc:  # on garde le démon en vie
            traceback.print_exc()
            _emit("@@RESULT", {"ok": False, "error": f"{type(exc).__name__}: {exc}"})


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    seedvc_dir = os.path.abspath(sys.argv[1])
    script = os.path.join(seedvc_dir, "inference.py")
    os.chdir(seedvc_dir)  # inference.py utilise des chemins relatifs (./checkpoints, configs/)
    sys.path.insert(0, seedvc_dir)
    _patch_torchaudio_save()
    _patch_bigvgan()
    if "--daemon" in sys.argv[2:]:
        daemon(script)
        return
    sys.argv = [script] + sys.argv[2:]
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main()
