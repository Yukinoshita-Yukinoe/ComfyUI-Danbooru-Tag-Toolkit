#!/usr/bin/env python3
"""Report which PixAI Tagger v1.0 tags are missing from the toolkit's tag database.

The model knows 30,877 tags; whatever is absent from tags_database/danbooru_tags.xlsx ends up in
``未归类词`` after the All-in-One sorter. This writes those tags to CSV so they can be added to the
workbook.

    python scripts/report_missing_tags.py
    python scripts/report_missing_tags.py --database tags_database/danbooru_tags_2509.xlsx
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[1]
COMFY_DIR = PACKAGE_DIR.parents[1]
DEFAULT_MODEL_CONFIG = COMFY_DIR / "models" / "taggers" / "pixai-tagger-v1.0" / "config.json"
DEFAULT_DATABASE = PACKAGE_DIR / "tags_database" / "danbooru_tags.xlsx"
# Kept out of tags_database/ itself: the sorter offers every .csv there as a tag database.
DEFAULT_OUTPUT = PACKAGE_DIR / "tags_database" / "reports" / "missing_tags.csv"


class ReportError(RuntimeError):
    pass


def require_pandas():
    try:
        import pandas
    except ModuleNotFoundError as exc:
        raise ReportError("Missing dependency 'pandas'. Install project requirements first.") from exc
    return pandas


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List model tags that the tag database cannot classify.")
    parser.add_argument("--config", type=Path, default=DEFAULT_MODEL_CONFIG, help="PixAI Tagger config.json.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="Toolkit tag workbook (.xlsx/.csv).")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV to write the missing tags to.")
    return parser.parse_args()


def lookup_key(tag: str) -> str:
    # The sorter keys the database on the lowercased tag with underscores turned into spaces.
    return str(tag or "").strip().lower().replace("_", " ")


def read_model_tags(config_path: Path) -> list[tuple[str, str]]:
    if not config_path.is_file():
        raise ReportError(f"{config_path} not found; download the model first (see README).")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    tags = config.get("tags") or []
    splits = config.get("tags_split") or []
    if not tags or not splits:
        raise ReportError(f"{config_path} has no tags / tags_split entries.")

    entries: list[tuple[str, str]] = []
    offset = 0
    for category, count in splits:
        entries.extend((tag, category) for tag in tags[offset:offset + count])
        offset += count
    return entries


def read_database_keys(database_path: Path) -> set[str]:
    pandas = require_pandas()
    if not database_path.is_file():
        raise ReportError(f"{database_path} not found.")

    table = pandas.read_csv(database_path) if database_path.suffix.lower() == ".csv" else pandas.read_excel(database_path)
    if "english" not in table.columns:
        raise ReportError(f"{database_path} has no 'english' column.")

    keys = set()
    for value in table["english"].dropna().astype(str):
        for part in value.replace("，", ",").split(","):
            key = lookup_key(part)
            if key:
                keys.add(key)
    return keys


def main() -> None:
    args = parse_args()
    entries = read_model_tags(args.config)
    database_keys = read_database_keys(args.database)

    missing = [(tag, category) for tag, category in entries if lookup_key(tag) not in database_keys]

    per_category: dict[str, list[int]] = {}
    for _tag, category in entries:
        counts = per_category.setdefault(category, [0, 0])
        counts[0] += 1
    for _tag, category in missing:
        per_category[category][1] += 1

    print(f"{args.database}: {len(entries) - len(missing)}/{len(entries)} model tags are classified "
          f"({(len(entries) - len(missing)) / len(entries):.1%})")
    for category, (total, absent) in per_category.items():
        print(f"  {category:<10} {total - absent:>6}/{total:<6} ({1 - absent / total:.1%})")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["english", "pixai_category"])
        writer.writerows(missing)
    print(f"wrote {len(missing)} tags to {args.output}")


if __name__ == "__main__":
    main()
