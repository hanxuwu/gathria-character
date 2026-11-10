#!/usr/bin/env python3
"""Inventory built-in wardrobe banks without decoding or modifying artwork.

Run from any directory:
  python scripts/inventory-wardrobe-coverage.py
  python scripts/inventory-wardrobe-coverage.py --check

The inventory records selectable legacy versions as well as current presets.
Non-catalog archives are listed separately and are NOT a visual-audit pass.
Only Python's standard library is required.
"""

import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs/wardrobe-coverage/inventory.json"
BASELINE_REVISION = "863d761bbdc927ea65080250c765b9c5c78c8fc4"
DUAL_CATALOGS = {
    "cotton-day": "docs/dual-view-wardrobe/assets/catalog.json",
    "tailored-day": "docs/dual-tailored/assets/catalog.json",
    "complete-day": "docs/dual-looks-cloth/assets/catalog.json",
    "polished-day": "docs/paired-polish/assets/catalog.json",
}
SLOTS = ("top", "bottom", "fullBody", "shoes")
PALETTES = ("sea", "apricot")


def relative(path):
    """Runtime URLs start with /; checked-in inventory paths are repo-relative."""
    return path.removeprefix("/")


def read_json(path):
    return json.loads((ROOT / relative(path)).read_text())


def digest(path):
    with (ROOT / relative(path)).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def manifest(path):
    with zipfile.ZipFile(ROOT / relative(path)) as archive:
        return json.loads(archive.read("manifest.json"))


def build_inventory():
    sources, registrations, assets = {}, {}, {}
    groups, issues = [], []

    def add_source(path):
        path = relative(path)
        if path not in sources:
            data = manifest(path)
            ids = [frame["id"] for frame in data["frames"]]
            animations = data["animations"]
            used = {frame for action in animations.values() for frame in action["frames"]}
            sources[path] = {
                "path": path,
                "sha256": digest(path),
                "name": data["name"],
                "frameCount": len(ids),
                "frameIds": ids,
                "frameWidth": data["spritesheet"]["frameWidth"],
                "frameHeight": data["spritesheet"]["frameHeight"],
                "animations": animations,
                "extraFramesNotInSourceAnimations": sorted(set(ids) - used),
            }
        return sources[path]

    def add_registration(path):
        path = relative(path)
        if path not in registrations:
            data = read_json(path)
            registrations[path] = {
                "path": path,
                "sha256": digest(path),
                "sourceSha256": data["sourceSha256"],
                "characterId": data["characterId"],
                "frameCount": len(data["frames"]),
                "frameIds": [frame["frameId"] for frame in data["frames"]],
                "frameWidth": data["frameWidth"],
                "frameHeight": data["frameHeight"],
            }
        return registrations[path]

    def add_group(group):
        group["sourceUrl"] = relative(group["sourceUrl"])
        group["registrationUrl"] = relative(group["registrationUrl"])
        source = add_source(group["sourceUrl"])
        registration = add_registration(group["registrationUrl"])
        group.update({
            "sourceFrameCount": source["frameCount"],
            "nativeSize": [source["frameWidth"], source["frameHeight"]],
            "sourceSha256": source["sha256"],
            "registrationSha256": registration["sha256"],
            "actionNames": list(source["animations"]),
            "sourceExtraFrameIds": source["extraFramesNotInSourceAnimations"],
            "uiAvailable": True,
        })
        for item in group["items"]:
            path = item["url"] = relative(item["url"])
            if path not in assets:
                data = manifest(path)
                ids = [frame["frameId"] for frame in data["frames"]]
                assets[path] = {
                    "path": path,
                    "sha256": digest(path),
                    "bytes": (ROOT / path).stat().st_size,
                    **{key: data[key] for key in (
                        "id", "name", "slot", "characterId", "sourceSha256",
                        "registrationSha256", "frameWidth", "frameHeight", "pages",
                    )},
                    "frameCount": len(ids),
                    "frameIds": ids,
                    "groups": [],
                    "actionCoverage": {},
                    "uiAvailable": True,
                }
            asset = assets[path]
            asset["groups"].append(group["id"])
            item.update({
                "id": asset["id"],
                "slot": asset["slot"],
                "frameCount": asset["frameCount"],
                "actualSha256": asset["sha256"],
                "bindingValid": (
                    source["sha256"] == asset["sourceSha256"]
                    and registration["sha256"] == asset["registrationSha256"]
                    and registration["sourceSha256"] == source["sha256"]
                ),
                "allNativeFramesPresent": set(source["frameIds"]) == set(asset["frameIds"]),
            })
            asset["actionCoverage"][group["id"]] = {
                name: {
                    "uniqueActionFrames": len(set(action["frames"])),
                    "covered": len(set(action["frames"]) & set(asset["frameIds"])),
                    "missing": sorted(set(action["frames"]) - set(asset["frameIds"])),
                }
                for name, action in source["animations"].items()
            }
            if not item["bindingValid"] or not item["allNativeFramesPresent"]:
                issues.append({
                    "group": group["id"], "path": path,
                    "bindingValid": item["bindingValid"],
                    "allNativeFramesPresent": item["allNativeFramesPresent"],
                })
            if "sha256" in item and item["sha256"] != asset["sha256"]:
                issues.append({
                    "group": group["id"], "path": path,
                    "issue": "catalog digest mismatch",
                })
        groups.append(group)

    # The original editor offers every item; older presets are in More/search.
    catalog_path = "docs/kling-wardrobe/catalog.json"
    for character in read_json(catalog_path)["characters"]:
        appearance_paths = [character["appearanceBankUrl"]] + [
            library["url"] for library in character.get("appearanceLibraries", [])
        ]
        add_group({
            "id": f"original-{character['key']}",
            "family": "original", "character": character["key"], "view": "original",
            "catalog": catalog_path,
            "sourceUrl": character["sourceUrl"],
            "registrationUrl": character["registrationUrl"],
            "items": character["items"], "presets": character["presets"],
            "uiAvailability": (
                "All catalog items selectable. Recommended outfits appear first; "
                "older presets remain available through More/search. "
                "Original/bare is a separate control."
            ),
            "appearancePathsOutsideGarmentCoverageScope": [relative(p) for p in appearance_paths],
        })

    # These direct URL imports are not JSON catalog entries. The guard below
    # fails when the runtime adds/removes a bank instead of silently omitting it.
    for sex in ("male", "female"):
        for collection in ("material", "tailored"):
            source = f"docs/kling-side-workspace/assets/{sex}.source.zip"
            if collection == "material":
                registration = f"docs/kling-side-workspace/assets/{sex}.registration.json"
                items = [
                    {"url": f"docs/kling-side-workspace/assets/{sex}-{slot}.garment.zip"}
                    for slot in ("top", "bottom", "shoes")
                ]
            else:
                registration = f"artwork/kling-side-expansion/templates/{sex}.registration.json"
                cuts = ("shirt", "trousers") if sex == "male" else ("blouse", "skirt")
                items = [
                    {"url": f"docs/kling-side-expansion/assets/{sex}-{cut}.garment.zip"}
                    for cut in cuts
                ]
            selection = dict.fromkeys(SLOTS)
            for item in items:
                data = manifest(item["url"])
                selection[data["slot"]] = data["id"]
            add_group({
                "id": f"side-{collection}-{sex}", "family": "side",
                "collection": collection, "character": sex, "view": "side",
                "catalog": "src/side-view/catalog.ts", "sourceUrl": source,
                "registrationUrl": registration, "items": items,
                "presets": [
                    {"id": "original", "selection": dict.fromkeys(SLOTS)},
                    {"id": "daily", "selection": selection},
                ],
                "uiAvailability": "Side collection selector.",
            })

    landing = read_json("docs/kling-landing-production/assets/catalog.json")
    add_group({
        "id": "side-landing-candidate-male", "family": "side",
        "collection": "landing-candidate", "character": "male", "view": "side",
        "catalog": "src/side-view/catalog.ts",
        "sourceUrl": "docs/kling-landing-production/assets/male.source.zip",
        "registrationUrl": "docs/kling-landing-production/assets/male.registration.json",
        "items": [
            {"url": f"docs/kling-landing-production/assets/male-{part}.garment.zip"}
            for part in ("daily-top", "daily-bottom", "wedding-top", "wedding-bottom")
        ],
        "presets": [
            {"id": name, "selection": selection}
            for name, selection in landing["presets"].items()
        ],
        "edition": landing["edition"],
        "visualAcceptance": landing["visualAcceptance"],
        "uiAvailability": (
            "Male side landing candidate only. Fresh loads use the current edition; "
            "previous editions remain importable as self-contained saved projects."
        ),
        "runtimeNotes": (
            "All native source frames are in scope, including bridge frames 107/108 "
            "outside the source manifest animation lists. Runtime motion contracts "
            "trim basic jump timing and add the run-jump-run landing route."
        ),
    })
    side_code = (ROOT / "src/side-view/catalog.ts").read_text()
    imported_side_banks = set(re.findall(r'"../../([^"\n]+\.garment\.zip)"', side_code))
    inventoried_side_banks = {
        item["url"] for group in groups if group["family"] == "side"
        for item in group["items"]
    }
    if imported_side_banks != inventoried_side_banks:
        raise ValueError("Side catalog imports changed; update inventory mapping: " + str(
            sorted(imported_side_banks ^ inventoried_side_banks)
        ))

    # Each palette is its own native artwork bank. Collections can reference
    # the same ZIP: e.g. female complete-day original == tailored-day original.
    for collection, path in DUAL_CATALOGS.items():
        for representation in read_json(path)["representations"]:
            items = representation["items"]
            for item in items:
                item.setdefault("logicalId", "cotton-tank" if item["slot"] == "top" else "cotton-shorts")
            presets = []
            for palette in PALETTES:
                selection = dict.fromkeys(SLOTS)
                for slot in ("top", "bottom"):
                    matches = [item for item in items if item["slot"] == slot and item["palette"] == palette]
                    if len(matches) != 1:
                        raise ValueError(f"Update dual inventory selection for {collection}/{slot}/{palette}")
                    selection[slot] = matches[0]["id"]
                presets.append({
                    "id": f"{collection}-{palette}", "palette": palette, "selection": selection,
                })
            character, view = representation["character"], representation["view"]
            add_group({
                "id": f"dual-{collection}-{character}-{view}", "family": "dual",
                "collection": collection, "character": character, "view": view,
                "catalog": path,
                "sourceUrl": representation["sourceUrl"],
                "registrationUrl": representation["registrationUrl"],
                "items": items, "presets": presets,
                "uiAvailability": (
                    "Paired wardrobe, both palettes; individual slots can be removed. "
                    "Complete-day is female-only. No cotton mix-ins are currently "
                    "present in tailored/complete/polished catalogs."
                ),
            })
    dual_code = (ROOT / "src/wardrobe/dual-view-catalog.ts").read_text()
    imported_dual_catalogs = set(re.findall(r'from "../../([^"\n]+/catalog\.json)"', dual_code))
    if imported_dual_catalogs != set(DUAL_CATALOGS.values()):
        raise ValueError("Dual-view catalog imports changed; update inventory mapping.")
    for group in [g for g in groups if g["family"] == "dual"]:
        counterpart = [g for g in groups if (
            g["family"] == "dual" and g["collection"] == group["collection"]
            and g["character"] == group["character"] and g["view"] != group["view"]
        )]
        if len(counterpart) != 1:
            raise ValueError(f"Dual collection is not runtime-complete: {group['id']}")

    historical, other_formats = [], collections.Counter()
    for base in ("docs", "artwork"):
        for path in sorted((ROOT / base).rglob("*.zip")):
            name = str(path.relative_to(ROOT))
            if name in assets:
                continue
            try:
                with zipfile.ZipFile(path) as archive:
                    if "manifest.json" not in archive.namelist():
                        other_formats["no-root-manifest"] += 1
                        continue
                    data = json.loads(archive.read("manifest.json"))
                if data.get("format") == "gathria-sprite-garment":
                    historical.append({
                        "path": name, "id": data.get("id"), "slot": data.get("slot"),
                        "characterId": data.get("characterId"),
                        "frameCount": len(data.get("frames", [])), "uiAvailable": False,
                        "status": (
                            "Not referenced by current built-in garment catalogs. "
                            "Historical/authoring/review archive, possibly manually "
                            "importable. No visual-audit claim."
                        ),
                    })
                else:
                    other_formats[data.get("format", "unknown")] += 1
            except (OSError, ValueError, zipfile.BadZipFile):
                other_formats["unreadable-or-no-manifest"] += 1

    duplicate_hashes = collections.defaultdict(list)
    for asset in assets.values():
        duplicate_hashes[asset["sha256"]].append(asset["path"])
    original = [g for g in groups if g["family"] == "original"]
    side = [g for g in groups if g["family"] == "side"]
    dual = [g for g in groups if g["family"] == "dual"]
    summary = {
        "activeGarmentReferenceCount": sum(len(g["items"]) for g in groups),
        "uniqueActiveGarmentFiles": len(assets),
        "uniqueGarmentFramePairs": sum(a["frameCount"] for a in assets.values()),
        "groups": len(groups), "sourcePacks": len(sources),
        "registrationFiles": len(registrations),
        "originalGarments": sum(len(g["items"]) for g in original),
        "sideStandaloneGarments": sum(len(g["items"]) for g in side),
        "dualGarmentReferences": sum(len(g["items"]) for g in dual),
        "dualUniqueGarmentFiles": len({i["url"] for g in dual for i in g["items"]}),
        "originalPresetsIncludingBare": sum(len(g["presets"]) for g in original),
        "sidePresetsIncludingBare": sum(len(g["presets"]) for g in side),
        "dualPairedOutfitPalettes": sum(len(g["presets"]) for g in dual if g["view"] == "original"),
        "dualRepresentationPresets": sum(len(g["presets"]) for g in dual),
        "archivedNonCatalogGarmentFiles": len(historical),
        "bindingOrFrameIssues": len(issues),
        "originalViewUniqueFiles": len({i["url"] for g in groups if g["view"] == "original" for i in g["items"]}),
        "sideViewUniqueFilesIncludingLanding": len({i["url"] for g in groups if g["view"] == "side" for i in g["items"]}),
    }
    return {
        "schemaVersion": 1,
        "provenance": {
            "baselineCommit": BASELINE_REVISION,
            "generator": "scripts/inventory-wardrobe-coverage.py",
            "note": "Inventory work started at baselineCommit. File SHA-256 values describe current checked-out assets.",
            "pathConvention": "Repository-relative paths, including sourceUrl/registrationUrl/url fields copied from runtime catalogs.",
        },
        "scope": (
            "Current built-in runtime-selectable garments, both native views, all "
            "listed legacy versions/palettes, and current male landing candidate. "
            "This is a metadata/hash/frame-binding inventory, NOT a visual pass. "
            "User-imported projects, non-catalog archives, hair/face banks, and "
            "embedded historical exports are outside garment visual-coverage claims."
        ),
        "summary": summary, "groups": groups, "assets": list(assets.values()),
        "sources": list(sources.values()), "registrations": list(registrations.values()),
        "duplicatePathReferences": {a["path"]: a["groups"] for a in assets.values() if len(a["groups"]) > 1},
        "duplicateArchiveSha256Groups": {h: paths for h, paths in duplicate_hashes.items() if len(paths) > 1},
        "issues": issues, "historicalNonCatalogGarments": historical,
        "historicalLandingEditions": read_json("src/side-view/landing-candidate-editions.json"),
        "otherZipFormatsOutsideGarmentScope": dict(sorted(other_formats.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if metadata differs; do not write.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    inventory = build_inventory()
    text = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text() != text:
            print(f"Inventory is stale: {args.output}. Regenerate without --check.", file=sys.stderr)
            return 1
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    print(json.dumps(inventory["summary"], ensure_ascii=False, indent=2))
    if inventory["issues"]:
        print("Binding/frame issues recorded; inspect inventory issues.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
