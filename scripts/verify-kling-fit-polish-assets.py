#!/usr/bin/env python3
"""Independent audit of versioned clothing assets, not visual acceptance.

Archives and source registrations from the merged baseline remain byte-exact.
New garment pages are decoded independently with Pillow and composed under
binary ownership. The application/browser/export audit is separate.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import traceback
import zipfile

import numpy as np
from PIL import Image

from kling_wardrobe_common import ROOT, load_source, protected_mask, sha

BASELINE = "c89e5add8d8b1a134e7cb3d7576c6370590cb57e"
OUTPUT = ROOT / "docs/kling-wardrobe/fit-polish/verification"
_spec = importlib.util.spec_from_file_location("previous_ownership_parser", ROOT / "scripts/verify-kling-full-outfit-ownership.py")
_previous = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_previous)
Garment = _previous.Garment


def describe(path):
    data = path.read_bytes()
    return {"file": str(path.relative_to(ROOT)), "bytes": len(data), "sha256": sha(data)}


def git_paths(*directories):
    return subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASELINE, "--", *directories], cwd=ROOT, text=True).splitlines()


def immutable_baseline():
    paths = git_paths("docs/kling-wardrobe/registration", "docs/kling-wardrobe/templates", "docs/kling-wardrobe/garments", "artwork/kling-wardrobe/source", "artwork/kling-wardrobe/registration")
    paths.extend(name for name in git_paths("docs/kling-motion/exports", "docs/kling-jump/exports") if name.endswith(".zip"))
    paths.extend(name for name in git_paths("docs/kling-wardrobe/full-outfits/exports") if name.endswith(".zip") and "/attempt-" not in name)
    paths.extend(["scripts/kling_wardrobe_common.py", "scripts/kling_male_limb_ownership.py", "scripts/prepare-kling-male-tops.py", "scripts/prepare-kling-male-trousers.py", "scripts/kling_dress_fit.py", "scripts/prepare-kling-wardrobe-dresses.py"])
    records = []
    # Only the directory index is mutable; old individual source provenance
    # notes remain protected together with their artwork.
    paths = [name for name in paths if name != "artwork/kling-wardrobe/source/README.md"]
    for name in sorted(set(paths)):
        before = subprocess.check_output(["git", "show", f"{BASELINE}:{name}"], cwd=ROOT)
        path = ROOT / name
        assert path.is_file(), f"Deleted original input: {name}"
        current = path.read_bytes()
        assert current == before, f"Historical input changed: {name}"
        records.append({"file": name, "bytes": len(current), "sha256": sha(current), "byteExactToBaseline": True})
    return records


def read_semantics(kit, fid):
    return {name: np.asarray(Image.open(io.BytesIO(kit.read(f"masks/{fid:03d}/{name}.png")))) > 0 for name in ["head", "nearHand", "farHand", "tank", "shorts"]}


def compose(base, layers, fid):
    out = base.copy()
    union = np.zeros(base.shape[:2], bool)
    for layer in layers:
        patch, owned = layer.frame(fid)
        out[owned] = patch[owned]
        union |= owned
    assert np.array_equal(out[~union], base[~union]), f"Pixels escaped ownership: {fid}"
    return out, union


def audit_item(path, registration_bytes, registered, sources, semantic_archive, old_path=None):
    garment = Garment(path, registration_bytes)
    previous = Garment(old_path, registration_bytes) if old_path is not None else None
    result = {**describe(path), "id": garment.manifest["id"], "slot": garment.manifest["slot"], "pageCount": len(garment.pages), "zipCrcAndPngDecodeValid": True, "frames": []}
    try:
        for fid in sorted(registered):
            base = sources[fid]
            rgba, owned = garment.frame(fid)
            assert not np.any(rgba[~owned]), (path, fid, "RGBA outside ownership")
            visible = base[:, :, 3] > 0
            protection = protected_mask(registered[fid]) & visible
            semantic = read_semantics(semantic_archive, fid)
            protected_semantic = (semantic["head"] | semantic["nearHand"] | semantic["farHand"]) & visible
            assert not np.any(owned & protection), (path, fid, "registered protection owned")
            assert not np.any(owned & protected_semantic), (path, fid, "semantic head/hand protection owned")
            composed, _ = compose(base, [garment], fid)
            assert np.array_equal(composed[protection | protected_semantic], base[protection | protected_semantic])
            assert not any(np.any(composed[edge][:, 3]) for edge in [np.s_[0, :], np.s_[-1, :], np.s_[:, 0], np.s_[:, -1]]), (path, fid, "clipped native margin")
            assert (composed[:, :, 3] == 0).any() and (composed[:, :, 3] > 0).any()
            # A top must cover source tank; a one-piece must also cover shorts.
            coverage = semantic["tank"] if garment.manifest["slot"] == "top" else semantic["shorts"]
            if garment.manifest["slot"] == "fullBody": coverage = semantic["tank"] | semantic["shorts"]
            if garment.manifest["slot"] in ["top", "bottom", "fullBody"]:
                opaque_cloth = coverage & (base[:, :, 3] >= 128)
                assert not np.any(opaque_cloth & (composed[:, :, 3] == 0)), (path, fid, "transparent hole in original opaque cloth")
            row = {"frameId": fid, "ownedPixels": int(owned.sum()), "visiblePatchPixels": int((rgba[:, :, 3] > 0).sum()), "protectedOwnedPixels": 0, "opaqueClothHoles": 0, "rgbaSha256": sha(rgba.tobytes()), "ownershipSha256": sha(owned.tobytes()), "composedRgbaSha256": sha(composed.tobytes())}
            if previous is not None:
                old_pixels, old_owned = previous.frame(fid)
                changed = np.any(rgba != old_pixels, axis=2) | (owned != old_owned)
                row.update({"changedPixelsVsPrevious": int(changed.sum()), "ownershipAdded": int((owned & ~old_owned).sum()), "ownershipRemoved": int((~owned & old_owned).sum()), "alphaChangedPixels": int((rgba[:, :, 3] != old_pixels[:, :, 3]).sum())})
                if garment.manifest["id"] == "ivory-wedding-dress-v4" and fid == 58:
                    # Reviewed gray donor-background triangle below the hem.
                    # These exact native coordinates are exposed source leg.
                    roi = np.s_[836:843, 165:180]
                    old_composed = base.copy(); old_composed[old_owned] = old_pixels[old_owned]
                    old_changed = int(np.any(old_composed[roi] != base[roi], axis=2).sum())
                    assert old_changed == 105, "Expected old under-hem defect is absent"
                    assert np.array_equal(composed[roi], base[roi]), "Donor-background triangle returned over the source leg"
                    row["underHemSourceLegRegression"] = {"rect": [165, 836, 15, 7], "oldChangedSourcePixels": old_changed, "currentChangedSourcePixels": 0, "sourceExact": True}
                if garment.manifest["id"] == "coral-daydress-v4" and fid == 58:
                    # Restored painted hem ink in the reviewed native crop.
                    # This guards the original missing-ink failure, not beauty.
                    roi = np.s_[803:818, 280:440]
                    before = old_pixels[roi]; after = rgba[roi]
                    old_ink = int(((before[:, :, :3].mean(axis=2) < 100) & (before[:, :, 3] > 200)).sum())
                    new_ink = int(((after[:, :, :3].mean(axis=2) < 100) & (after[:, :, 3] > 200)).sum())
                    assert old_ink > 0 and new_ink >= old_ink * 1.4, "Recovered dark hem ink is missing again"
                    row["paintedHemInkRegression"] = {"rect": [280, 803, 160, 15], "oldOpaqueInkPixels": old_ink, "newOpaqueInkPixels": new_ink, "minimumFractionVsOld": 1.4, "notAnAestheticScore": True}
                if garment.manifest["id"] in ["navy-suit-jacket-v2", "teal-camp-shirt-v2"]:
                    assert not np.any(owned & ~old_owned), (path, fid, "new top expands old ownership")
                    removed = old_owned & ~owned
                    assert not np.any(removed & semantic["tank"]), (path, fid, "old tank coverage removed")
                    assert np.array_equal(rgba[owned, 3], old_pixels[owned, 3]), (path, fid, "native owned alpha moved")
                    row["existingTopOwnershipSubsetAndAlphaExact"] = True
                    if garment.manifest["id"] == "navy-suit-jacket-v2" and fid in [0, 104]:
                        points = registered[fid]["points"]
                        wl, wr = points["waistLeft"], points["waistRight"]
                        yy, xx = np.indices(base.shape[:2])
                        waist_y = wl["y"] + (xx-wl["x"]) * (wr["y"]-wl["y"]) / max(1, wr["x"]-wl["x"])
                        region = (abs(yy-waist_y) <= 12) & semantic["tank"] & (base[:, :, :3].mean(axis=2) < 50) & (base[:, :, 3] > 200) & old_owned & owned
                        old_copied = int((region & np.all(old_pixels == base, axis=2)).sum())
                        new_copied = int((region & np.all(rgba == base, axis=2)).sum())
                        # The original tank's dark interior hem was incorrectly
                        # copied into the replacement jacket. Exterior shared
                        # contour may remain, but that interior stripe must not.
                        assert old_copied > 10, (fid, "baseline hem probe absent")
                        assert new_copied <= old_copied * .4, (fid, "old tank hem reintroduced")
                        row["interiorTankHemRegression"] = {"oldSourceInkCopied": old_copied, "newSourceInkCopied": new_copied, "maximumRetainedFraction": .4, "region": "Native registered waist ±12px, source tank mask, original opaque ink meanRGB<50; exterior shared contour allowed."}
            result["frames"].append(row)
        result["changedFramesVsPrevious"] = sum(row.get("changedPixelsVsPrevious", 0) > 0 for row in result["frames"])
        return result
    finally:
        garment.close()
        if previous is not None: previous.close()


def male_determinism(catalog):
    """Fresh repeated fits equal both each other and the packaged candidate."""
    path = ROOT / "scripts/prepare-kling-male-fit-polish.py"
    spec = importlib.util.spec_from_file_location("candidate_male_fit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from kling_male_limb_ownership import MaleLimbOwnership
    entry = next(entry for entry in catalog["characters"] if entry["key"] == "male")
    items = {item["id"]: item for item in entry["items"]}
    author = MaleLimbOwnership()
    _, _, _, frames = load_source("male")
    records = []
    try:
        for old_id, new_id in [("teal-camp-shirt-v1", "teal-camp-shirt-v2"), ("navy-suit-jacket-v1", "navy-suit-jacket-v2")]:
            bank = Garment(ROOT / items[new_id]["url"].lstrip("/"), author.registration_bytes)
            try:
                for fid in [0, 51, 64, 104]:
                    original = frames[fid]
                    first = module.prepare_frame(old_id, original.copy(), author.guides[fid], author.semantic(fid), author.for_frame(fid, original), author.points(fid))
                    second = module.prepare_frame(old_id, original.copy(), author.guides[fid], author.semantic(fid), author.for_frame(fid, original), author.points(fid))
                    packaged = bank.frame(fid)
                    for kind, a, b, c in zip(["rgba", "ownership"], first, second, packaged):
                        assert np.array_equal(a, b), (new_id, fid, kind, "nondeterministic repeated fit")
                        assert np.array_equal(a, c), (new_id, fid, kind, "package differs from current prep script")
                    records.append({"id": new_id, "frameId": fid, "rgbaSha256": sha(first[0].tobytes()), "ownershipSha256": sha(first[1].tobytes()), "repeatAndPackageExact": True})
            finally:
                bank.close()
    finally:
        author.close()
    return {"script": describe(path), "maleSamples": records}


def female_determinism(catalog):
    path = ROOT / "scripts/prepare-kling-dress-fit-v4.py"
    spec = importlib.util.spec_from_file_location("candidate_dress_fit", path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    entry = next(e for e in catalog["characters"] if e["key"] == "female")
    items = {item["id"]: item for item in entry["items"]}
    registration_bytes = (ROOT / entry["registrationUrl"].lstrip("/")).read_bytes()
    guides = {f["frameId"]: f for f in json.loads(registration_bytes)["frames"]}
    _, _, _, frames = load_source("female")
    donor = np.asarray(Image.open(module.SOURCE).convert("RGB"))
    rows = []
    with zipfile.ZipFile(ROOT / entry["templateUrl"].lstrip("/")) as kit:
        for base_id, new_id, ivory in [("coral-daydress", "coral-daydress-v4", False), ("ivory-wedding-dress", "ivory-wedding-dress-v4", True)]:
            definition = module.DEFINITIONS[base_id]
            first_skirt = module.cutout(donor, definition["skirt"], True, ivory)[0]
            second_skirt = module.cutout(donor, definition["skirt"], True, ivory)[0]
            assert np.array_equal(first_skirt, second_skirt), (new_id, "nondeterministic donor extraction")
            crop = donor[1106:1147, 735:826] if ivory else donor[1106:1147, 250:350]
            material = np.median(crop.reshape(-1, 3), axis=0)
            bank = Garment(ROOT / items[new_id]["url"].lstrip("/"), registration_bytes)
            try:
                for fid in [0, 58, 89, 104]:
                    masks = {name: np.asarray(Image.open(io.BytesIO(kit.read(f'masks/{fid:03d}/{"head" if name == "headNeck" else name}.png')))) > 0 for name in ["tank", "shorts", "skin", "headNeck", "nearArm", "farArm", "nearHand", "farHand"]}
                    first = module.prepare_frame(frames[fid].copy(), guides[fid], masks, definition, first_skirt, material)
                    second = module.prepare_frame(frames[fid].copy(), guides[fid], masks, definition, second_skirt, material)
                    packaged = bank.frame(fid)
                    for kind, a, b, c in zip(["rgba", "ownership"], first, second, packaged):
                        assert np.array_equal(a, b), (new_id, fid, kind, "nondeterministic repeated fit")
                        assert np.array_equal(a, c), (new_id, fid, kind, "package differs from current prep script")
                    rows.append({"id": new_id, "frameId": fid, "rgbaSha256": sha(first[0].tobytes()), "ownershipSha256": sha(first[1].tobytes()), "repeatAndPackageExact": True})
            finally:
                bank.close()
    return {"femaleScript": describe(path), "femaleHemHelper": describe(ROOT / "scripts/kling_dress_fit_v4.py"), "femaleSamples": rows}


def main(args, report):
    report["immutableInputs"] = immutable_baseline()
    if args.baseline_only:
        report["scope"] = "Baseline byte-preservation only; candidate assets not yet checked."
        return
    baseline_catalog = json.loads(subprocess.check_output(["git", "show", f"{BASELINE}:docs/kling-wardrobe/catalog.json"], cwd=ROOT))
    current_catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_text())
    old_ids = {entry["key"]: {item["id"]: item for item in entry["items"]} for entry in baseline_catalog["characters"]}
    report["catalog"] = describe(ROOT / "docs/kling-wardrobe/catalog.json")
    report["garments"] = []
    report["sourceBindings"] = []
    report["outfits"] = []
    for entry in current_catalog["characters"]:
        character = entry["key"]
        registration_path = ROOT / entry["registrationUrl"].lstrip("/")
        registration_bytes = registration_path.read_bytes()
        registration = json.loads(registration_bytes)
        registered = {f["frameId"]: f for f in registration["frames"]}
        source_bytes, manifest, config, sources = load_source(character)
        _previous.assert_source_registration(registration, manifest, config, source_bytes)
        assert all(len(f["points"]) == 17 for f in registered.values())
        template_path = ROOT / entry["templateUrl"].lstrip("/")
        report["sourceBindings"].append({"character": character, "source": describe(ROOT / entry["sourceUrl"].lstrip("/")), "registration": describe(registration_path), "template": describe(template_path), "nativeSize": [registration["frameWidth"], registration["frameHeight"]], "anchor": registration["anchor"], "pointsPerPose": 17, "poses": len(registered), "actionMetadataSha256": sha(json.dumps(manifest["animations"], sort_keys=True).encode()), "sourceAndAnchorImmutable": True})
        with zipfile.ZipFile(template_path) as kit:
            assert kit.testzip() is None
            assert kit.read("source.character.zip") == source_bytes
            assert kit.read("registration.json") == registration_bytes
            selected_items = [item for item in entry["items"] if item["id"] not in old_ids[character]]
            assert selected_items, f"No new versioned items for {character}"
            for item in selected_items:
                old_id = item["id"].rsplit("-v", 1)[0] + ("-v1" if character == "male" else "-v3")
                assert old_id in old_ids[character], f"Specify predecessor for new garment: {item['id']}"
                previous_path = ROOT / old_ids[character][old_id]["url"].lstrip("/")
                path = ROOT / item["url"].lstrip("/")
                row = audit_item(path, registration_bytes, registered, sources, kit, previous_path)
                row["previous"] = describe(previous_path)
                assert row["changedFramesVsPrevious"] > 0, f"Version is an unchanged duplicate: {item['id']}"
                report["garments"].append(row)
            # Complete default looks plus mixed top/bottom selections. Shoes are
            # tested under registration, retaining four reviewed old shoe/mask
            # overlaps rather than silently changing immutable semantic masks.
            items = {item["id"]: item for item in entry["items"]}
            presets = {p["id"]: p for p in entry["presets"]}
            selections = [(name, presets[name]["selection"]) for name in ["day", "wedding"]]
            if character == "male":
                a, b = presets["day"]["selection"], presets["wedding"]["selection"]
                selections.extend([("day-top-wedding-bottom", {**a, "bottom": b["bottom"]}), ("wedding-top-day-bottom", {**b, "bottom": a["bottom"]})])
            for name, selection in selections:
                order = ["shoes", "fullBody"] if selection["fullBody"] else ["shoes", "bottom", "top"]
                layers = [Garment(ROOT / items[selection[slot]]["url"].lstrip("/"), registration_bytes) for slot in order if selection[slot]]
                try:
                    rows = []
                    for fid in sorted(registered):
                        base = sources[fid]
                        out, owned = compose(base, layers, fid)
                        protected = protected_mask(registered[fid]) & (base[:, :, 3] > 0)
                        assert np.array_equal(base[protected], out[protected]), (character, name, fid, "registered identity changed")
                        semantic = read_semantics(kit, fid)
                        assert np.array_equal(base[semantic["head"]], out[semantic["head"]]), (character, name, fid, "head pixels changed")
                        opaque = (semantic["tank"] | semantic["shorts"]) & (base[:, :, 3] >= 128)
                        assert not np.any(opaque & (out[:, :, 3] == 0)), (character, name, fid, "opaque clothing hole")
                        rows.append({"frameId": fid, "rgbaSha256": sha(out.tobytes()), "protectedChanged": 0, "opaqueClothHoles": 0})
                    report["outfits"].append({"character": character, "look": name, "selection": selection, "frames": rows})
                finally:
                    for layer in layers: layer.close()
    assert len(report["garments"]) >= 4, "Expected new male tops and female dresses"
    report["determinism"] = male_determinism(current_catalog)
    report["determinism"].update(female_determinism(current_catalog))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-only", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or OUTPUT / ("immutable-baseline.json" if args.baseline_only else "assets.json")
    report = {"format": "gathria-kling-fit-polish-asset-audit", "version": 1, "startedAt": datetime.now(timezone.utc).isoformat(), "baselineCommit": BASELINE, "scope": "Independent archive/pixel/source-bound contract audit. Browser workflows and visual acceptance are separate.", "passed": False}
    try:
        main(args, report)
        report["passed"] = True
    except Exception as error:
        report["failure"] = traceback.format_exc()
        raise
    finally:
        report["completedAt"] = datetime.now(timezone.utc).isoformat()
        report["auditScript"] = describe(Path(__file__))
        report["parserDependency"] = describe(ROOT / "scripts/verify-kling-full-outfit-ownership.py")
        report["commonDependency"] = describe(ROOT / "scripts/kling_wardrobe_common.py")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"passed": report["passed"], "immutableInputs": len(report.get("immutableInputs", [])), "garments": len(report.get("garments", [])), "outfits": len(report.get("outfits", [])), "report": str(output.relative_to(ROOT))}))
