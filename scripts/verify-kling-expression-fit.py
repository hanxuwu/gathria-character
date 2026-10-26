#!/usr/bin/env python3
"""Independently reconstruct the completed expression/fit production downloads.

Pillow/NumPy only. Reuses the earlier independent decoder and compositor, never
application rendering code. Requires the captured build and all three temporary
project downloads to remain available until the audit completes.
"""
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/verify-kling-expression-shirt.py"
spec = importlib.util.spec_from_file_location("independent_export_decoder", HELPER)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
require, sha, file_sha = prior.require, prior.sha, prior.file_sha
Archive, Project, rgba = prior.Archive, prior.Project, prior.rgba
ACTIONS = prior.ACTIONS
FACES = (None, "gentle", "joyful", "gentle-v2", "joyful-v2")
HAIR = {"male": ("side-part", "airy-tousle"), "female": ("tucked-bun", "ribbon-pony")}
SAILOR_POSES = {("run", i) for i in (58, 59, 60)} | {("celebrate", i) for i in (77, 78, 79)} | {("jump", i) for i in (85, 86, 87, 95, 96, 97, 103, 104, 105)}
FEMALE_POSES = {("idle", 0), ("run", 58), ("run", 62), ("jump", 86), ("jump", 89), ("jump", 96), ("jump", 101), ("jump", 102), ("jump", 103), ("jump", 112), ("celebrate", 78), ("celebrate", 79)}
PACK_KEYS = {"male-midnight-sailor-v2-gentle-v2", "female-plum-pintuck-top-v1-navy-shorts-joyful-v2", "female-plum-pintuck-top-v1-ochre-shorts-joyful-v2"}


def coverage(evidence):
    require(evidence.get("passed") is True and evidence.get("finishedAt"), "Capture is incomplete")
    require(evidence["format"] == "gathria-expression-fit-browser-evidence" and evidence["production"] is True, "Expected production expression/fit capture")
    for name, count in {"matrix": 24, "screenshots": 8, "gifs": 30, "packs": 3, "projects": 3, "playback": 30}.items():
        require(len(evidence[name]) == count, f"Incomplete {name} coverage")
    require(sum(r["kind"] == "png" for r in evidence["downloads"]) == 122, "Expected 122 actual native PNG downloads")
    expected = {(c, look, HAIR[c][look == "wedding"], f) for c in HAIR for look in ("day", "wedding") for f in FACES}
    expressions = [r for r in evidence["matrix"] if r.get("look") in ("day", "wedding")]
    require({(r["character"], r["look"], r["hairId"], r["faceId"]) for r in expressions} == expected, "Missing baseline/refined expression matrix")
    for row in evidence["matrix"]:
        if row.get("look") == "day":
            poses = {("idle", 0), ("run", 59), ("jump", 86), ("celebrate", 78)}
            if row["faceId"] in ("joyful", "joyful-v2"):
                poses |= {("jump", 90), ("jump", 102)}
        elif row.get("look") == "wedding":
            poses = {("idle", 0), ("jump", 86)}
        else:
            poses = SAILOR_POSES if row["character"] == "male" else FEMALE_POSES
        require(len(row["pngs"]) == len(poses) and {(p["action"], p["frameId"]) for p in row["pngs"]} == poses, f"Missing native poses: {row['key']}")
    require({r["key"] for r in evidence["packs"]} == {r["key"] for r in evidence["projects"]} == PACK_KEYS, "Missing final saved looks")
    require({r["key"] for r in evidence["matrix"] if not r.get("look")} == PACK_KEYS | {"male-midnight-sailor-v1-gentle-v2"}, "Missing garment comparisons")
    expected_gifs = set()
    for row in evidence["matrix"]:
        if row.get("look") == "wedding":
            clips = []
        elif row.get("look") == "day":
            clips = [("run", "right")]
            if row["faceId"] in ("joyful", "joyful-v2"):
                clips.append(("jump", "right"))
        elif row["character"] == "male":
            clips = [("run", "right"), ("run", "left"), ("jump", "right"), ("celebrate", "right")]
        else:
            clips = [("run", "right"), ("run", "left"), ("jump", "right"), ("celebrate", "right")]
        expected_gifs.update((row["key"], action, facing) for action, facing in clips)
    require({(r["key"], r["action"], r["facing"]) for r in evidence["gifs"]} == expected_gifs and len(expected_gifs) == 30, "Missing specific GIF actions/directions")
    for field in ("errors", "consoleErrors", "failedRequests", "externalRequests", "independentEditorRequests"):
        require(evidence[field] == [], f"Recorded browser failures: {field}")
    require(evidence.get("editorsClosedAt"), "Editor closure not recorded")


def artifact_checks(evidence, index, report):
    downloads = {r["file"]: r for r in evidence["downloads"]}
    require(len(downloads) == len(evidence["downloads"]), "Duplicate download paths")
    require(all(r["actualUiDownload"] for r in downloads.values()), "Non-UI artifact mislabeled as download")
    require(all(not r["actualUiDownload"] for r in evidence["screenshots"]), "Screenshot mislabeled as native export")
    paths = [r["file"] for r in evidence["downloads"] + evidence["screenshots"]]
    require(len(paths) == len(set(paths)), "Duplicate artifact/screenshot paths")
    cache = {}
    for row in evidence["downloads"] + evidence["screenshots"]:
        path = ROOT / row["file"]
        require(path.stat().st_size == row["bytes"] and file_sha(path) == row["sha256"], f"Artifact size/hash mismatch: {path}")
        result = {k: row[k] for k in ("file", "kind", "bytes", "sha256")}
        if path.suffix == ".zip":
            result["archive"] = prior.scan_zip(path.read_bytes(), row["file"], cache)
        elif path.suffix == ".png":
            with Image.open(path) as image:
                image.load()
                result.update(width=image.width, height=image.height, mode=image.mode)
        elif path.suffix == ".gif":
            frames, delays, loop = prior.read_gif(path)
            result.update(frames=len(frames), width=frames[0].shape[1], height=frames[0].shape[0], delaysMs=delays, loop=loop)
            del frames
        else:
            raise AssertionError(f"Unexpected artifact: {path}")
        report["artifacts"].append(result)
    snapshot = index.parent / "capture-script.mjs"
    require(snapshot.is_file(), "Captured script snapshot missing")
    files = {**evidence["inputs"], **evidence["compiledJsSha256"],
             "dist/workbench.html": evidence["productionHtmlSha256"], "dist/player.html": evidence["playerHtmlSha256"],
             str(snapshot.relative_to(ROOT)): evidence["scriptSha256"], "docs/kling-wardrobe/catalog.json": evidence["catalogSha256"]}
    for name, digest in files.items():
        require(file_sha(ROOT / name) == digest, f"Captured build/input changed: {name}")
    require(len(evidence["catalogResponses"]) == 2 and all(r["sha256"] == evidence["catalogSha256"] for r in evidence["catalogResponses"]), "Served catalog mismatch")
    require(evidence["scriptRequests"] and all(r["compiledSha256"] in evidence["compiledJsSha256"].values() for r in evidence["scriptRequests"]), "Unrecorded JavaScript")
    report["capturedBuildFiles"] = files
    return downloads


def selection_checks(evidence, catalog):
    entries = {c["key"]: c for c in catalog["characters"]}
    def preset(character, identifier):
        return next(p["selection"] for p in entries[character]["presets"] if p["id"] == identifier)
    presets = {"male": {"day": "day-soft-cuff", "wedding": "wedding-curved-cuff"},
               "female": {"day": "day-smooth-waist", "wedding": "wedding-smooth-waist"}}
    final = {
        "male-midnight-sailor-v2-gentle-v2": ("male", "midnight-sailor-refined", "airy-tousle", "gentle-v2", "midnight-sailor-v2", "ochre-chinos-v1"),
        "female-plum-pintuck-top-v1-navy-shorts-joyful-v2": ("female", "plum-pintuck-day", "ribbon-pony", "joyful-v2", "plum-pintuck-top-v1", "navy-shorts"),
        "female-plum-pintuck-top-v1-ochre-shorts-joyful-v2": ("female", "plum-pintuck-ochre", "ribbon-pony", "joyful-v2", "plum-pintuck-top-v1", "ochre-shorts"),
    }
    for row in evidence["matrix"]:
        require(row["hairColor"] == "chestnut", "Matrix hair color differs from review plan")
        if row.get("look"):
            identifier = presets[row["character"]][row["look"]]
            require(row["presetId"] == identifier and row["selection"] == preset(row["character"], identifier), "Expression comparison uses wrong current outfit")
        else:
            key = row["key"].replace("midnight-sailor-v1", "midnight-sailor-v2")
            character, identifier, hair, face, top, bottom = final[key]
            selected = preset(character, identifier).copy()
            require(selected["top"] == top and selected["bottom"] == bottom, "Final catalog preset has unexpected garment IDs")
            if "midnight-sailor-v1" in row["key"]:
                selected["top"] = "midnight-sailor-v1"
            require(row.get("presetId", row.get("finalPresetId")) == identifier and row["selection"] == selected, "Garment matrix uses wrong current outfit")
            require((row["character"], row["hairId"], row["faceId"]) == (character, hair, face), "Garment comparison face/hair differs")
    for row in evidence["packs"] + evidence["projects"]:
        character, identifier, hair, face, top, bottom = final[row["key"]]
        require(row["character"] == character and row["selection"] == preset(character, identifier), "Final saved look differs from required preset")
        require(row["selection"]["top"] == top and row["selection"]["bottom"] == bottom, "Final saved garment IDs differ")
        require((row["appearance"]["hairId"], row["appearance"]["faceId"], row["appearance"]["hairColor"]) == (hair, face, "chestnut"), "Final saved face/hair differs")


def pack_checks(evidence, catalog, report):
    projects = {p["key"]: p for p in evidence["projects"]}
    for row in evidence["packs"]:
        print(f"Reconstructing every exported pack frame: {row['key']}", flush=True)
        saved = projects[row["key"]]
        project = Project(ROOT / saved["file"])
        pack = Archive(ROOT / row["file"])
        m, sm, doc = pack.manifest, project.source.manifest, project.doc
        entry = next(c for c in catalog["characters"] if c["key"] == row["character"])
        saved_items = {i["id"]: i for i in doc["items"]}
        for item_id in {i for i in doc["selection"].values() if i}:
            catalog_item = next(i for i in entry["items"] if i["id"] == item_id)
            require(saved_items[item_id]["sha256"] == catalog_item["sha256"] == file_sha(ROOT / catalog_item["url"].lstrip("/")), "Saved selected garment differs from captured catalog bytes")
        require(m == row["manifest"], "Recorded pack manifest differs from ZIP")
        require(set(m["animations"]) == ACTIONS and m["animations"] == sm["animations"], "Source clocks changed")
        require([f["id"] for f in m["frames"]] == [f["id"] for f in sm["frames"]], "Source frame IDs/order changed")
        require(m["facing"] == sm["facing"] and m["scale"] == sm["scale"], "Source facing/scale changed")
        require(doc["sourceSha256"] == row["sourceSha256"] == saved["sourceSha256"], "Source hashes disagree")
        require(doc["registrationSha256"] == saved["registrationSha256"], "Registration hash changed")
        require(doc["appearance"]["bankSha256"] == saved["appearanceBankSha256"], "Saved bank hash mismatch")
        p = project.padding
        require(m["anchor"] == {**sm["anchor"], "x": sm["anchor"]["x"] + p["left"], "y": sm["anchor"]["y"] + p["top"]}, "Padded source anchor changed")
        size = (sm["spritesheet"]["frameWidth"] + p["left"] + p["right"], sm["spritesheet"]["frameHeight"] + p["top"] + p["bottom"])
        require((m["spritesheet"]["frameWidth"], m["spritesheet"]["frameHeight"]) == size, "Native frame scale changed")
        cfg = json.loads(pack.zip.read(m["configuration"]))
        scfg = json.loads(project.source.zip.read(sm["configuration"]))
        require(cfg["source"] == scfg["source"] and cfg["derivation"]["frames"] == scfg["derivation"]["frames"], "Source frame/time provenance changed")
        require(cfg["sourceMetadata"]["wardrobe"]["selection"] == doc["selection"] == row["selection"] == saved["selection"], "Saved clothing differs")
        require(cfg["sourceMetadata"]["appearance"]["selection"] == doc["appearance"] == row["appearance"] == saved["appearance"], "Saved expression differs")
        require(doc["preview"] == saved["preview"] == {"action": "run", "facing": "left"}, "Saved preview settings differ")
        require(saved["exactReopen"] and saved["before"] == saved["after"] and row["exportedAfterReopen"] and saved["reopenedAt"] == row["reopenedAt"], "Exact reopen/export chronology missing")
        frames = []
        for f in m["frames"]:
            actual = pack.frame(f["id"])
            expected = project.render(f["id"], doc["appearance"]["faceId"])
            require(actual.shape == expected.shape == (size[1], size[0], 4), "Pack frame geometry differs")
            require(np.array_equal(actual, expected), f"Independent reconstruction differs: {row['key']}/{f['id']}")
            require(np.any(actual[:, :, 3] == 0) and np.any(actual[:, :, 3] == 255), "Transparency lost")
            frames.append({"frameId": f["id"], "rgbaSha256": sha(actual.tobytes()), "alphaSha256": sha(actual[:, :, 3].tobytes()), "exactProjectComposition": True})
        report["packs"].append({"key": row["key"], "file": row["file"], "project": saved["file"], "nativeSize": size, "padding": p,
                                "sourceClocksAndFrameIdsExact": True, "sourceFrameTimeProvenanceExact": True, "geometryAnchorFacingExact": True,
                                "savedSelectionAndReopenExact": True, "rgbaAndAlphaExactForEveryFrame": True, "frames": frames})
        del project, pack, actual, expected
        gc.collect()


def configure(project, row, entry, release):
    """Bind recorded controls to hash-checked catalog materials, then reconstruct."""
    recorded = {i["id"]: i for i in row["items"]}
    chosen = {i for i in row["selection"].values() if i}
    require(set(recorded) == chosen, "Recorded garment list differs from selected slots")
    for item_id in chosen:
        item = next(i for i in entry["items"] if i["id"] == item_id)
        require(recorded[item_id] == item, "Recorded garment metadata differs from captured catalog")
        path = ROOT / item["url"].lstrip("/")
        require(file_sha(path) == item["sha256"], f"Garment bytes changed: {item_id}")
        if not hasattr(project, "catalog_item_hashes"):
            project.catalog_item_hashes = {i["id"]: i["sha256"] for i in project.doc["items"]}
        if item_id not in project.items or project.catalog_item_hashes.get(item_id) != item["sha256"]:
            project.items[item_id] = Archive(path)
            project.catalog_item_hashes[item_id] = item["sha256"]
        a = project.items[item_id]
        require(a.manifest["sourceSha256"] == project.doc["sourceSha256"] and a.manifest["registrationSha256"] == project.doc["registrationSha256"], "Garment binding differs")
    bank_info = next(b["release"] for b in release["banks"] if b["character"] == row["character"] and any(s["id"] == row["hairId"] for s in b["release"]["styles"]))
    offered = {entry["appearanceBankUrl"]: entry["appearanceRevision"]["bankSha256"], **{b["url"]: b["sha256"] for b in entry.get("appearanceLibraries", [])}}
    require(offered.get(bank_info["url"]) == bank_info["sha256"], "Selected bank is not the captured catalog bank")
    path = ROOT / bank_info["url"].lstrip("/")
    require(file_sha(path) == bank_info["sha256"], "Selected appearance bank bytes changed")
    if project.doc["appearance"]["bankSha256"] != bank_info["sha256"]:
        project.bank = Archive(path)
        project.poses = {p["frameId"]: p for p in project.bank.manifest["poses"]}
        project.padding = project.bank.manifest["padding"]
    require(project.bank.manifest["sourceSha256"] == project.doc["sourceSha256"] and project.bank.manifest["registrationSha256"] == project.doc["registrationSha256"], "Appearance bank binding differs")
    project.doc["selection"] = row["selection"].copy()
    project.doc["appearance"] = {"bankSha256": bank_info["sha256"], "hairId": row["hairId"], "faceId": row["faceId"], "hairColor": row["hairColor"]}
    return bank_info


def face_ownership(bank, frame_id, face, shape):
    allowed = np.zeros(shape, dtype=bool)
    if face is None:
        return allowed
    style = next(s for s in bank.manifest["styles"] if s["id"] == face)
    p = bank.manifest["padding"]
    for layer in style["layers"]:
        f = next(f for f in layer["frames"] if f["frameId"] == frame_id)
        if f["mode"] == "source":
            continue
        _, owned = bank.paint(f)
        x, y = f["offset"]["x"] + p["left"], f["offset"]["y"] + p["top"]
        allowed[y:y+owned.shape[0], x:x+owned.shape[1]] |= owned
    return allowed


def matrix_checks(evidence, catalog, release, report):
    all_pngs, all_gifs = set(), set()
    for character in ("male", "female"):
        entry = next(c for c in catalog["characters"] if c["key"] == character)
        saved = next(p for p in evidence["projects"] if p["character"] == character)
        project = Project(ROOT / saved["file"])
        require(file_sha(ROOT / entry["sourceUrl"].lstrip("/")) == project.doc["sourceSha256"], "Catalog/project source differs")
        rows = [r for r in evidence["matrix"] if r["character"] == character]
        for row in rows:
            print(f"Checking native PNGs and GIF schedule: {row['key']}", flush=True)
            bank_info = configure(project, row, entry, release)
            for png in row["pngs"]:
                require(png["file"] not in all_pngs, "Duplicate matrix PNG")
                all_pngs.add(png["file"])
                for key in ("selection", "hairId", "faceId", "hairColor", "character"):
                    require(png[key] == row[key], "PNG selection differs from row")
                require(png["facing"] == "right" and project.source.manifest["animations"][png["action"]]["frames"][png["position"]] == png["frameId"], "PNG source schedule position differs")
                actual = rgba((ROOT / png["file"]).read_bytes())
                expected = project.render(png["frameId"], row["faceId"])
                require(np.array_equal(actual, expected), f"Native PNG independent composition differs: {png['file']}")
                require(actual.shape[:2] == (png["uiCanvas"]["height"], png["uiCanvas"]["width"]), "PNG canvas geometry differs")
                digest = sha(actual.tobytes())
                report["pngs"].append({"file": png["file"], "rgbaSha256": digest, "exactRegisteredComposition": True, "rawRgbaEqualsCanvasReadback": digest == png["uiCanvas"]["rgbaSha256"], "bankSha256": bank_info["sha256"]})
                if row.get("look") and row["faceId"] is not None:
                    natural = next((p for r in rows if r.get("look") == row["look"] and r["faceId"] is None for p in r["pngs"] if p["frameId"] == png["frameId"]), None)
                    if natural:
                        reference = rgba((ROOT / natural["file"]).read_bytes())
                        allowed = face_ownership(project.bank, png["frameId"], row["faceId"], actual.shape[:2])
                        require(np.array_equal(actual[:, :, 3], reference[:, :, 3]), "Expression PNG changed alpha")
                        changed = np.any(actual != reference, axis=2)
                        require(not np.any(changed & ~allowed), "Expression PNG changed outside its face ownership")
                        report["expressionInvariants"].append({"file": png["file"], "reference": natural["file"], "alphaExact": True, "outsideFaceOwnershipExact": True, "changedPixels": int(changed.sum())})
                if row.get("look") and row["faceId"] in ("gentle-v2", "joyful-v2"):
                    old_face = row["faceId"].removesuffix("-v2")
                    baseline = next(p for r in rows if r.get("look") == row["look"] and r["faceId"] == old_face for p in r["pngs"] if p["frameId"] == png["frameId"])
                    reference = rgba((ROOT / baseline["file"]).read_bytes())
                    allowed = face_ownership(project.bank, png["frameId"], row["faceId"], actual.shape[:2]) | face_ownership(project.bank, png["frameId"], old_face, actual.shape[:2])
                    changed = np.any(actual != reference, axis=2)
                    require(np.array_equal(actual[:, :, 3], reference[:, :, 3]) and not np.any(changed & ~allowed), "Refinement changed alpha or pixels outside old/new face ownership")
                    if old_face == "joyful":
                        require(bool(changed.any()) == (png["frameId"] in (88, 89, 90, 91, 100, 101, 102, 103)), "Joyful refinement changed the wrong native poses")
                    report["refinedVsBaseline"].append({"file": png["file"], "reference": baseline["file"], "frameId": png["frameId"], "faceId": row["faceId"], "alphaExact": True, "outsideOldAndNewFaceOwnershipExact": True, "changedPixels": int(changed.sum())})
            for gif in [g for g in evidence["gifs"] if g["key"] == row["key"]]:
                require(gif["hairId"] == row["hairId"] and gif["faceId"] == row["faceId"], "GIF selection differs")
                expected = {fid: project.render(fid, row["faceId"]) for fid in set(gif["sourceSchedule"]["frames"])}
                report["gifs"].append(prior.gif_audit(gif, expected, project.source.manifest))
                all_gifs.add(gif["file"])
                del expected
        del project
        gc.collect()
    require(all_pngs == {r["file"] for r in evidence["downloads"] if r["kind"] == "png"}, "Some native PNGs were not independently reconstructed")
    require(all_gifs == {r["file"] for r in evidence["gifs"]}, "Some GIFs were not independently checked")


def playback_checks(evidence, report):
    for left in [g for g in evidence["gifs"] if g["facing"] == "left"]:
        right = next(g for g in evidence["gifs"] if g["key"] == left["key"] and g["action"] == left["action"] and g["facing"] == "right")
        lf, ld, ll = prior.read_gif(ROOT / left["file"])
        rf, rd, rl = prior.read_gif(ROOT / right["file"])
        require(ld == rd and ll == rl and len(lf) == len(rf), "Mirrored GIF schedules differ")
        require(all(np.array_equal(l, r[:, ::-1]) for l, r in zip(lf, rf)), "GIF left/right mirror differs")
        report["mirrorPairs"].append({"left": left["file"], "right": right["file"], "allFramesExactMirror": True})
    packs = {p["key"]: p for p in evidence["packs"]}
    seen = set()
    for row in evidence["playback"]:
        identity = (row["key"], row["action"], row["facing"])
        require(identity not in seen, "Duplicate playback case")
        seen.add(identity)
        manifest = packs[row["key"]]["manifest"]
        for observed in row["observed"]:
            require(observed["frameId"] == manifest["animations"][observed["action"]]["frames"][observed["position"]], "Player shows wrong source frame")
        selected = [o for o in row["observed"] if o["action"] == row["action"]]
        positions = {o["position"] for o in selected}
        require(len(positions) >= 3, "Insufficient observed player progress")
        clip = manifest["animations"][row["action"]]
        wraps = sum(b["position"] < a["position"] for a, b in zip(selected, selected[1:]))
        require(wraps > 0 if clip["loop"] else any(o["action"] == "idle" for o in row["observed"]), "Player loop/return failed")
        missing = [i for i in range(len(clip["frames"])) if i not in positions]
        require(missing == row["missingPositions"], "Recorded missing player positions differ")
        report["playback"].append({"key": row["key"], "action": row["action"], "facing": row["facing"], "observedPositions": len(positions), "missingPositions": missing, "loopOrReturnObserved": True})
    require(seen == {(key, action, facing) for key in PACK_KEYS for action in ACTIONS for facing in ("left", "right")}, "Player coverage incomplete")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=ROOT / "docs/kling-expression-fit/evidence/final-v1/evidence-index.json")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-expression-fit/artifact-validation.json")
    args = parser.parse_args()
    require(not args.output.exists(), "Preserve existing audit; choose a new output path")
    data = args.index.read_bytes()
    evidence = json.loads(data)
    coverage(evidence)
    report = {"format": "gathria-expression-fit-independent-artifact-verification", "version": 1, "passed": False,
              "evidenceIndex": str(args.index.relative_to(ROOT)), "evidenceIndexSha256": sha(data), "verifierSha256": file_sha(Path(__file__)),
              "independentDecoder": {"file": str(HELPER.relative_to(ROOT)), "sha256": file_sha(HELPER)},
              "method": "Independent Pillow/NumPy straight-RGBA reconstruction from recorded source, registered garments and appearance banks; no application rendering imports.",
              "limitations": ["Browser chronology is recorded by capture, not independently recreated offline.", "GIF palette is lossy: per-frame grayscale nearest-pose and foreground RGB error checks use the retained verifier tolerances; tiny face correctness comes from lossless PNG and pack checks.", "Canvas premultiplication may round translucent RGB; canvas digests are reported separately from exact native export comparisons.", "Pixel reconstruction does not establish anatomical or artistic acceptance.", "Retain all three temporary project downloads and captured production build to reproduce this audit."],
              "artifacts": [], "packs": [], "pngs": [], "gifs": [], "expressionInvariants": [], "refinedVsBaseline": [], "mirrorPairs": [], "playback": []}
    artifact_checks(evidence, args.index, report)
    catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_bytes())
    selection_checks(evidence, catalog)
    release_path = ROOT / "docs/kling-expression-refined/release-index.json"
    release = json.loads(release_path.read_bytes())
    asset_path = ROOT / "docs/kling-expression-refined/asset-validation.json"
    assets = json.loads(asset_path.read_bytes())
    require(assets["passed"] and assets["totalUniqueSourcePoses"] == 184 and assets["totalBanks"] == 8 and assets["releaseIndexSha256"] == file_sha(release_path), "Full expression bank audit missing/stale")
    for character in assets["characters"]:
        source_paths = {p["sourceSha256"] for p in evidence["projects"] if p["character"] == character["character"]}
        require(source_paths == {character["sourceSha256"]}, "Capture source differs from independently audited original source")
        for bank in character["banks"]:
            require(file_sha(ROOT / bank["file"]) == bank["sha256"] and file_sha(ROOT / bank["originalFile"]) == bank["originalSha256"], "Audited current/legacy bank changed")
    report["faceOwnershipAudit"] = {"file": str(asset_path.relative_to(ROOT)), "sha256": file_sha(asset_path), "sourcePoses": 184, "banks": 8}
    pack_checks(evidence, catalog, report)
    matrix_checks(evidence, catalog, release, report)
    playback_checks(evidence, report)
    report["summary"] = {"artifacts": len(report["artifacts"]), "packs": len(report["packs"]), "exactProjectFrames": sum(len(p["frames"]) for p in report["packs"]),
                         "exactNativePngs": len(report["pngs"]), "expressionAlphaAndOwnershipComparisons": len(report["expressionInvariants"]),
                         "refinedVersusBaselineComparisons": len(report["refinedVsBaseline"]),
                         "gifs": len(report["gifs"]), "exactMirrorPairs": len(report["mirrorPairs"]), "playbackCases": len(report["playback"])}
    report["passed"] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": True, **report["summary"], "output": str(args.output.relative_to(ROOT))}))


if __name__ == "__main__":
    main()
