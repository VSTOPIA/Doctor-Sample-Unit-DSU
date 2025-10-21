#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys


def copy_into(src: pathlib.Path, dst: pathlib.Path) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists():
            # merge contents
            for p in src.iterdir():
                copy_into(p, dst / p.name)
        else:
            shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)


def ensure_metadata(base: pathlib.Path, dataset_id: str, title: str, private: bool, subtitle: str, description: str) -> None:
    meta = {
        "title": title,
        "id": dataset_id,
        "licenses": [{"name": "CC0-1.0"}],
        "subtitle": subtitle,
        "description": description,
        "isPrivate": bool(private),
        "keywords": ["audio", "demucs", "pytorch", "dsu"],
        "resources": [],
    }
    (base / "dataset-metadata.json").write_text(json.dumps(meta, indent=2))


def kaggle_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["kaggle", *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def dataset_exists(dataset_id: str) -> bool:
    # kaggle datasets view returns 0 when dataset exists
    r = kaggle_cli("datasets", "view", dataset_id)
    return r.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and publish DSU Kaggle cache dataset (wheels/models)")
    parser.add_argument("--dataset-id", required=True, help="e.g. vstopia/dsu-cache")
    parser.add_argument("--title", default="DSU Cache (Torch/Demucs wheels + models)")
    parser.add_argument("--subtitle", default="Prebuilt wheels for fast DSU notebook startup")
    parser.add_argument("--description", default="Pre-downloaded wheels for Torch/Torchaudio (multiple CUDA flavors) and Demucs, plus optional model checkpoints.")
    parser.add_argument("--private", action="store_true")
    parser.add_argument("--out", required=True, help="Output folder to assemble dataset (e.g. ./dsu-cache)")
    parser.add_argument("--wheels-cu126", help="Folder with CUDA 12.6 wheels (torch+cu126, torchaudio+cu126)")
    parser.add_argument("--wheels-cu124", help="Folder with CUDA 12.4 wheels")
    parser.add_argument("--wheels-cu121", help="Folder with CUDA 12.1 wheels")
    parser.add_argument("--wheels-cu118", help="Folder with CUDA 11.8 wheels")
    parser.add_argument("--wheels", help="Generic wheels folder (fallback)")
    parser.add_argument("--models", help="Demucs models/checkpoints folder (optional)")
    parser.add_argument("--licenses", help="Folder with license texts to include (optional)")
    parser.add_argument("--readme", help="Optional README.md path to include")
    parser.add_argument("--message", default="Update DSU cache", help="Version message when updating existing dataset")

    args = parser.parse_args()

    # Pre-flight: kaggle.json present?
    home = pathlib.Path.home()
    kg = home / ".kaggle" / "kaggle.json"
    if not kg.exists():
        print("ERROR: kaggle.json not found. Place it in ~/.kaggle/kaggle.json and chmod 600.", file=sys.stderr)
        return 2

    base = pathlib.Path(args.out).resolve()
    if base.exists():
        # keep structure but clear prior content to avoid stale files
        shutil.rmtree(base)
    base.mkdir(parents=True, exist_ok=True)

    # Assemble structure
    if args.wheels_cu126 := getattr(args, "wheels_cu126"):
        copy_into(pathlib.Path(args.wheels_cu126), base / "wheels_cu126")
    if args.wheels_cu124 := getattr(args, "wheels_cu124"):
        copy_into(pathlib.Path(args.wheels_cu124), base / "wheels_cu124")
    if args.wheels_cu121 := getattr(args, "wheels_cu121"):
        copy_into(pathlib.Path(args.wheels_cu121), base / "wheels_cu121")
    if args.wheels_cu118 := getattr(args, "wheels_cu118"):
        copy_into(pathlib.Path(args.wheels_cu118), base / "wheels_cu118")
    if args.wheels:
        copy_into(pathlib.Path(args.wheels), base / "wheels")
    if args.models:
        copy_into(pathlib.Path(args.models), base / "models")
    if args.licenses:
        copy_into(pathlib.Path(args.licenses), base / "LICENSES")
    if args.readme:
        copy_into(pathlib.Path(args.readme), base / "README.md")

    # Metadata
    ensure_metadata(base, args.dataset_id, args.title, args.private, args.subtitle, args.description)

    # Create or version
    if dataset_exists(args.dataset_id):
        print("Dataset exists; creating new version…")
        r = kaggle_cli("datasets", "version", "-p", str(base), "-m", args.message, "-r", "zip")
    else:
        print("Creating dataset…")
        r = kaggle_cli("datasets", "create", "-p", str(base))
    sys.stdout.write(r.stdout)
    return 0 if r.returncode == 0 else r.returncode


if __name__ == "__main__":
    sys.exit(main())


