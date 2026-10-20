#!/usr/bin/env python3
"""Store a PixAI Tagger checkpoint in bfloat16.

The published checkpoint is float32 (1.9 GB). Inference runs in bfloat16 anyway, so converting it
on disk halves the download-to-first-tag time and the disk footprint without changing the node.

    python scripts/convert_pixai_tagger_bf16.py <model_dir>            # writes <model_dir>-bf16
    python scripts/convert_pixai_tagger_bf16.py <model_dir> --output <dir>
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

COPY_FILES = ("config.json", "preprocessor_config.json", "tagger_pipeline.py")


class ConversionError(RuntimeError):
    pass


def require_torch_and_safetensors():
    try:
        import torch
        from safetensors.torch import load_file, save_file
    except ModuleNotFoundError as exc:
        raise ConversionError(
            f"Missing dependency '{exc.name}'. Run this in the environment that runs ComfyUI."
        ) from exc
    return torch, load_file, save_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert a PixAI Tagger checkpoint to bfloat16 weights.")
    parser.add_argument("model_dir", type=Path, help="Folder containing config.json and model.safetensors.")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Target folder. Default: <model_dir>-bf16 next to the source folder.",
    )
    parser.add_argument("--force", action="store_true", help="Replace the target folder if it already exists.")
    return parser.parse_args()


def convert(source_dir: Path, target_dir: Path) -> None:
    torch, load_file, save_file = require_torch_and_safetensors()

    weights = sorted(path for path in source_dir.glob("*.safetensors"))
    if len(weights) != 1:
        raise ConversionError(f"Expected exactly one .safetensors file in {source_dir}, found {len(weights)}.")

    tensors = load_file(str(weights[0]))
    converted = {}
    kept = []
    for name, tensor in tensors.items():
        if tensor.dtype == torch.float32:
            converted[name] = tensor.to(torch.bfloat16)
        else:
            converted[name] = tensor
            kept.append(f"{name} ({tensor.dtype})")

    target_dir.mkdir(parents=True, exist_ok=True)
    save_file(converted, str(target_dir / weights[0].name), metadata={"format": "pt"})
    for name in COPY_FILES:
        if (source_dir / name).is_file():
            shutil.copy2(source_dir / name, target_dir / name)

    before = weights[0].stat().st_size / 1024 ** 3
    after = (target_dir / weights[0].name).stat().st_size / 1024 ** 3
    print(f"{len(converted)} tensors -> {target_dir} ({before:.2f} GB -> {after:.2f} GB)")
    if kept:
        print("kept as-is: " + ", ".join(kept))


def main() -> None:
    args = parse_args()
    source_dir = args.model_dir.resolve()
    if not (source_dir / "config.json").is_file():
        raise ConversionError(f"{source_dir} has no config.json; it is not a PixAI Tagger folder.")

    target_dir = (args.output.resolve() if args.output else source_dir.with_name(source_dir.name + "-bf16"))
    if target_dir == source_dir:
        raise ConversionError("Target and source are the same folder; pass a different --output.")
    if target_dir.exists() and not args.force:
        raise ConversionError(f"{target_dir} already exists. Pass --force to replace it.")

    convert(source_dir, target_dir)


if __name__ == "__main__":
    main()
