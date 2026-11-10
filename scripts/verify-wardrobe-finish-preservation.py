#!/usr/bin/env python3
"""Verify source pixels/timing, shared anchors and frame identities after refits.

The frozen, hash-pinned input needs no temporary files or Git history. Garment
artwork itself is checked by the separate per-repair pixel-scope verifiers.
This check does not certify visual quality or arbitrary outfit combinations.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "artwork/wardrobe-finish/baseline-bindings.json"
BASELINE_SHA = "ced6d00694c81d3d917fd6688c37a5f275c12b768f5c17e762d9afbf9eeac0e2"


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    require(digest(BASELINE) == BASELINE_SHA, "Frozen source/anchor baseline changed")
    baseline = json.loads(BASELINE.read_text())
    inventory = json.loads((ROOT / "docs/wardrobe-coverage/inventory.json").read_text())
    require(not inventory["issues"], "Active garment inventory has binding/frame errors")
    unchanged = {}
    for kind in ("sources", "registrations", "immutablePermissionFiles"):
        for row in baseline[kind]:
            require(digest(ROOT / row["path"]) == row["sha256"],
                    f"Immutable {kind} changed: {row['path']}")
        unchanged[kind] = len(baseline[kind])
    current = {row["path"]: row for row in inventory["assets"]}
    require(len(current) == len(inventory["assets"]), "Duplicate active asset path")
    require(set(current) == {row["path"] for row in baseline["garments"]},
            "Refinement unexpectedly changed the selectable garment collection")
    changes = []
    for old in baseline["garments"]:
        path = ROOT / old["path"]
        actual_sha = digest(path)
        require(actual_sha == current[old["path"]]["sha256"],
                f"Stale current inventory: {old['path']}")
        with zipfile.ZipFile(path) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        for key in ("id", "slot", "characterId", "sourceSha256", "registrationSha256",
                    "frameWidth", "frameHeight"):
            require(manifest[key] == old[key], f"Changed {key}: {old['path']}")
        ids = [row["frameId"] for row in manifest["frames"]]
        require(ids == old["frameIds"], f"Native frame order or IDs changed: {old['path']}")
        if actual_sha != old["sha256"]:
            changes.append({"path": old["path"], "beforeSha256": old["sha256"],
                            "sha256": actual_sha, "frameCount": len(ids)})
    return {
        "format": "gathria-wardrobe-finish-preservation",
        "version": 1,
        "baselineCommit": baseline["commit"],
        "baselineBindingsSha256": BASELINE_SHA,
        "byteExact": unchanged,
        "nativeGarmentIdentityAndFrameOrderExact": len(current),
        "changedGarments": len(changes),
        "unchangedGarments": len(current) - len(changes),
        "changes": changes,
        "limit": "Source pixels, timing, old permission maps and shared registration are exact. "
                 "Garment art changes require separate scoped repair validation and visual review.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", type=Path)
    args = parser.parse_args()
    result = verify()
    if args.write_report:
        args.write_report.parent.mkdir(parents=True, exist_ok=True)
        args.write_report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key != "changes"}))
