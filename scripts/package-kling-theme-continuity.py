#!/usr/bin/env python3
"""Package the selected female repair and an explicitly isolated rejected trial.

Uses the existing crop/register/pack builder. No new rendering or redraw step.
Published R1/R2 files are checked before and after preparation.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("theme_builder", ROOT / "scripts/prepare-kling-theme-assets.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def check_baseline():
    baseline = json.loads((ROOT / "artwork/kling-themes/source/continuity-v3/baseline.json").read_text())
    for file, expected in baseline["files"].items():
        assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == expected, file


if __name__ == "__main__":
    check_baseline()
    for file in ["female-pixel-storybook-v3.recipe.json", "female-pixel-storybook-wedding-v3.recipe.json"]:
        builder.build_pixel(ROOT / "artwork/kling-themes/source" / file)
    builder.catalog_index()
    # This rejected source must never appear in the shipping theme catalog.
    trial = ROOT / "docs/kling-theme-continuity/trial"
    builder.EXPORTS = trial
    builder.ART = trial
    builder.build_pixel(ROOT / "artwork/kling-themes/source/continuity-v3/male-run16-rejected.recipe.json")
    (trial / "male-pixel-storybook-run-study.theme.zip").replace(trial / "male-run16-study.theme.zip")
    check_baseline()
    print("Preserved all published baseline files; rejected trial remains outside catalog.")
