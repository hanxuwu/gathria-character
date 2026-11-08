#!/usr/bin/env python3
"""Read-only regression guard for the additive female V9 forearm repair.

This does not invoke authoring scripts or write assets. It preserves the pinned
historical V8 -> V9 forearm proof, then verifies the separately reviewed coverage
addition in the currently served V8/V9 archives. Historical V8 bytes are read
from a pinned merged ancestor (CI explicitly checks out full history); no
pre-existing temporary workspace or authoring output is required.
"""
import hashlib
import io
import json
import subprocess
import tempfile
import zipfile
from contextlib import ExitStack
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from kling_wardrobe_common import ROOT, protected_mask

SOURCE_SHA = "90a7d2a227910a399dabab805ac1a335240684c06d8d8eb57e88f236a5cbad23"
REGISTRATION_SHA = "c2b19a7a63aa40619babcc23eaa97d1673e79e82e6f8aa157a733869c7a2f953"
PINS = {
    "coral-daydress": {
        "baseline": "abad0ecea7db3607408368d48424bab843fb786e383982dd06478ca0c2673ab0",
        "donor": "fae154e975eed157f30451936913d8339585012091b07f23944470704472b400",
        "candidate": "1e8a4c9ed25bd19eef2a8a00560bfb6ba8daffc963aecdc46745fd278eef87f6",
    },
    "ivory-wedding-dress": {
        "baseline": "e788b1666ee4fee9665030aa897dbd1d3cfed93ae99f625435fa875f8826c5c3",
        "donor": "ec50681fdf5a7fc1c41e08c22f4f0adf1de683f52ade3721380e33e46e641a9d",
        "candidate": "bfd8aaa11cdcff5e314110b313f26619270b2dfc4b8c7bfebb24e79ef2b35c1f",
    },
}
EXPECTED = {55: (451, [324, 668, 388, 685]), 63: (320, [328, 662, 384, 676])}
FRAME_SHAPE = (1056, 704, 4)
NECKLINE_SHA = "9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c"
ISLAND_TRACE_SHA = "69a98fc256d51e84b5430c57c56365266e07d6b0f5300974ed107b80aa9fcc23"
# Canonical JSON pin tolerates formatting only, never review/mask/hash changes.
COVERAGE_REVIEW_SHA = "b70a4719b460baa8b29b6e85a6b2a499d504d12015f8fa774363059b2312427a"
COVERAGE_POSES = {62, 89, 90, 93, 101, 102, 103, 112}
HISTORICAL_REVISION = "5d63ae233ca83e61dc354e122a8708044f4e2653"


def require(condition, message):
    # Unlike assert, this remains active when Python runs with optimization.
    if not condition:
        raise ValueError(message)


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class GarmentReader:
    """Decode one atlas page at a time; never retain all 96 full-size frames."""

    def __init__(self, archive):
        self.archive = archive
        self.manifest = json.loads(archive.read("manifest.json"))
        self.frames = {row["frameId"]: row for row in self.manifest["frames"]}
        require(len(self.frames) == len(self.manifest["frames"]), "Duplicate frame IDs")
        require(self.manifest["frameWidth"] == 704 and self.manifest["frameHeight"] == 1056,
                "Garment changed native dimensions")
        require(self.manifest["sourceSha256"] == SOURCE_SHA, "Garment source changed")
        require(self.manifest["registrationSha256"] == REGISTRATION_SHA,
                "Garment registration changed")
        self.cached_index = None
        self.rgba = self.mask = None

    def frame(self, frame_id):
        row = self.frames[frame_id]
        if row["page"] != self.cached_index:
            page = self.manifest["pages"][row["page"]]
            self.rgba = self.mask = None
            self.rgba = np.asarray(Image.open(io.BytesIO(self.archive.read(page["file"]))).convert("RGBA"))
            mask = np.asarray(Image.open(io.BytesIO(self.archive.read(page["maskFile"]))).convert("RGBA"))
            require(self.rgba.shape == (page["height"], page["width"], 4), "RGBA page dimensions")
            require(mask.shape == self.rgba.shape, "Ownership page dimensions")
            require(np.isin(mask[:, :, 3], [0, 255]).all(), "Ownership must be binary")
            self.mask = mask[:, :, 3] == 255
            self.cached_index = row["page"]
        r, offset = row["rect"], row["offset"]
        x, y, w, h = r["x"], r["y"], r["width"], r["height"]
        ox, oy = offset["x"], offset["y"]
        require(0 <= x and 0 <= y and w > 0 and h > 0 and
                x + w <= self.rgba.shape[1] and y + h <= self.rgba.shape[0], "Invalid atlas rectangle")
        require(0 <= ox and 0 <= oy and ox + w <= 704 and oy + h <= 1056,
                "Patch outside native frame")
        rgba = np.zeros(FRAME_SHAPE, np.uint8)
        owned = np.zeros(FRAME_SHAPE[:2], bool)
        rgba[oy:oy + h, ox:ox + w] = self.rgba[y:y + h, x:x + w]
        owned[oy:oy + h, ox:ox + w] = self.mask[y:y + h, x:x + w]
        require(owned.any(), f"Empty garment frame {frame_id}")
        require(not np.any(rgba[~owned, 3]), f"Visible unowned pixels in frame {frame_id}")
        return rgba, owned


def catalog_items(value):
    if isinstance(value, dict):
        if "id" in value and "url" in value:
            yield value
        for child in value.values():
            yield from catalog_items(child)
    elif isinstance(value, list):
        for child in value:
            yield from catalog_items(child)


def coverage_evidence():
    profile_path = ROOT / "artwork/kling-mask-workbench/female-neckline-cloth-v1.json"
    trace_path = ROOT / "artwork/kling-female-top/source/ownership-repairs.json"
    require(file_sha(profile_path) == NECKLINE_SHA, "Approved neckline cloth map changed")
    require(file_sha(trace_path) == ISLAND_TRACE_SHA, "Approved cloth island traces changed")
    profile, traces = json.loads(profile_path.read_text()), json.loads(trace_path.read_text())
    for data in [profile, traces]:
        require(data["sourceSha256"] == SOURCE_SHA and
                data["registrationSha256"] == REGISTRATION_SHA,
                "Coverage review source/registration binding changed")
    require(profile["id"] == "female-neckline-cloth-v1", "Wrong neckline profile")
    review = json.loads((ROOT / "docs/wardrobe-coverage/original-female/repair-report.json").read_text())
    canonical = json.dumps(review, sort_keys=True, separators=(",", ":")).encode()
    require(hashlib.sha256(canonical).hexdigest() == COVERAGE_REVIEW_SHA,
            "Frozen coverage review changed")
    permissions = {}
    for frame in profile["frames"]:
        mask = np.zeros(FRAME_SHAPE[:2], bool)
        for run in frame["runs"]:
            mask[run["y"], run["x0"]:run["x1"] + 1] = True
        permissions[frame["frameId"]] = mask
    require(set(permissions) == {89, 90, 93, 101, 102, 103}, "Neckline review pose scope")
    return {item["itemId"]: item for item in review}, permissions, traces


def verify_served_coverage(item_id, historical_path, historical_pin, served_path,
                           catalog_entries, review, permissions, traces, rows,
                           protections, original_frames, template):
    """Independent decode/mask proof; never call the authoring/repair builder."""
    entry = review[item_id]
    require(entry["beforeSha256"] == historical_pin and file_sha(historical_path) == historical_pin,
            f"{item_id}: historical coverage input changed")
    require(file_sha(served_path) == entry["afterSha256"], f"{item_id}: served coverage archive changed")
    matches = [item for item in catalog_entries if item["id"] == item_id]
    require(len(matches) == 1, f"{item_id}: expected one selectable catalog entry")
    require(matches[0]["url"] == entry["url"] == "/" + str(served_path.relative_to(ROOT)),
            f"{item_id}: catalog URL changed")
    # Legacy V8 catalog descriptors never carried an optional byte-count field.
    # V9's required historical/current byte counts are checked in main below.
    require(matches[0]["sha256"] == entry["afterSha256"] and
            ("bytes" not in matches[0] or matches[0]["bytes"] == served_path.stat().st_size),
            f"{item_id}: catalog coverage integrity metadata")
    reviewed = {frame["frameId"]: frame for frame in entry["changedFrames"]}
    require(set(reviewed) == COVERAGE_POSES, f"{item_id}: coverage pose scope changed")
    polygons = {frame["frameId"]: frame["polygon"] for frame in traces["repairs"]}
    rule = traces["sourceClothRule"]
    added_total = 0
    with zipfile.ZipFile(historical_path) as old_zip, zipfile.ZipFile(served_path) as new_zip:
        old, new = GarmentReader(old_zip), GarmentReader(new_zip)
        require(old.manifest["version"] == 1 and new.manifest["version"] == 3,
                f"{item_id}: expected explicit V1 -> V3 coverage opt-in")
        require(new.manifest.get("necklinePermissionProfile") == "female-neckline-cloth-v1" and
                not new.manifest.get("handProtectionReviews"),
                f"{item_id}: unexpected protection exception")
        for key in ["format", "id", "name", "slot", "characterId", "sourceSha256",
                    "registrationSha256", "frameWidth", "frameHeight"]:
            require(old.manifest[key] == new.manifest[key], f"{item_id}: {key} changed")
        require(set(old.frames) == set(new.frames) == set(rows), f"{item_id}: native frame set changed")
        for fid in sorted(rows):
            before, old_owned = old.frame(fid)
            after, new_owned = new.frame(fid)
            require(not np.any(old_owned & ~new_owned), f"{item_id}/{fid}: historical ownership removed")
            added = new_owned & ~old_owned
            if fid not in reviewed:
                require(not added.any() and np.array_equal(before, after),
                        f"{item_id}/{fid}: unrelated pose changed")
                continue
            original = original_frames[fid]
            expected = np.zeros(FRAME_SHAPE[:2], bool)
            if fid in polygons:
                image = Image.new("L", (704, 1056))
                ImageDraw.Draw(image).polygon([tuple(point) for point in polygons[fid]], fill=255)
                r, g, b = np.moveaxis(original[:, :, :3].astype(np.int16), 2, 0)
                cloth = ((original[:, :, 3] > rule["minimumAlpha"]) &
                         (r - g < rule["redMinusGreenMaximum"]) &
                         (r - b < rule["redMinusBlueMaximum"]) &
                         (r - b > rule["redMinusBlueMinimum"]) &
                         (r > rule["redMinimum"]) & (r < rule["redMaximum"]))
                shorts = np.asarray(Image.open(io.BytesIO(template.read(f"masks/{fid:03d}/shorts.png")))) > 0
                expected |= ((np.asarray(image) > 0) & cloth & ~old_owned & ~shorts &
                             ~protected_mask(rows[fid]))
            permission = permissions.get(fid, np.zeros(FRAME_SHAPE[:2], bool))
            expected |= permission & ~old_owned
            proof = reviewed[fid]
            require(np.array_equal(added, expected), f"{item_id}/{fid}: coverage escaped exact cloth review")
            require(hashlib.sha256(added.tobytes()).hexdigest() == proof["maskSha256"],
                    f"{item_id}/{fid}: reviewed addition mask changed")
            require(int(added.sum()) == proof["addedPixels"], f"{item_id}/{fid}: addition count changed")
            require(np.array_equal(before[~added], after[~added]),
                    f"{item_id}/{fid}: paint outside reviewed addition changed")
            require(not np.any(new_owned & protections[fid] & ~permission),
                    f"{item_id}/{fid}: source skin/head/hand protection expanded")
            require(np.array_equal(after[added, 3], original[added, 3]),
                    f"{item_id}/{fid}: added cloth source alpha changed")
            old_composite, new_composite = original.copy(), original.copy()
            old_composite[old_owned], new_composite[new_owned] = before[old_owned], after[new_owned]
            require(np.array_equal(old_composite[:, :, 3], new_composite[:, :, 3]),
                    f"{item_id}/{fid}: composed alpha changed")
            require(np.array_equal(old_composite[~added], new_composite[~added]),
                    f"{item_id}/{fid}: source pixels outside reviewed cloth changed")
            for label, pixels in [("beforeRgbaSha256", old_composite), ("afterRgbaSha256", new_composite)]:
                require(hashlib.sha256(pixels.tobytes()).hexdigest() == proof[label],
                        f"{item_id}/{fid}: reviewed composed RGB changed")
            added_total += int(added.sum())
    return {"id": item_id, "decodedFrames": 96, "unchangedRgbaFrames": 88,
            "reviewedClothFrames": sorted(reviewed), "addedClothPixels": added_total,
            "sourceAlphaAndOutsideClothExact": True, "approvedClothMasksExact": True,
            "historicalForearmRepairUntouched": True}


def verify_current_coverage_pair(item_id, historical_path, served_path):
    """Shared read-only guard for the contour verifier's pinned V8 archives.

    The caller supplies historical bytes; this wrapper neither fetches history
    nor writes files. Both inputs are independently checked against fixed pins.
    """
    prefix, version = item_id.rsplit("-v", 1)
    require(prefix in PINS and version in ("8", "9"), "Unsupported coverage chain")
    historical_pin = PINS[prefix]["baseline" if version == "8" else "candidate"]
    review, permissions, traces = coverage_evidence()
    source_path = ROOT / "docs/kling-motion/exports/female.character.zip"
    require(file_sha(source_path) == SOURCE_SHA, "Original female CharacterPack changed")
    catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_text())
    originals = {}
    with zipfile.ZipFile(source_path) as source, zipfile.ZipFile(
            ROOT / "docs/kling-wardrobe/templates/female.wardrobe-template.zip") as template:
        registration_bytes = template.read("registration.json")
        require(hashlib.sha256(registration_bytes).hexdigest() == REGISTRATION_SHA,
                "Registration bytes changed")
        rows = {row["frameId"]: row for row in json.loads(registration_bytes)["frames"]}
        manifest = json.loads(source.read("manifest.json"))
        require(len(rows) == 96 and set(rows) == {row["id"] for row in manifest["frames"]},
                "Expected all96 registered source poses")
        pages = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        for index, page in enumerate(pages):
            needed = [frame for frame in manifest["frames"]
                      if frame.get("page", 0) == index and frame["id"] in COVERAGE_POSES]
            if not needed:
                continue
            with Image.open(io.BytesIO(source.read(page["file"]))) as image:
                for frame in needed:
                    x, y, w, h = frame["x"], frame["y"], frame["width"], frame["height"]
                    require((h, w, 4) == FRAME_SHAPE, "Source native frame dimensions")
                    originals[frame["id"]] = np.asarray(
                        image.crop((x, y, x + w, y + h)).convert("RGBA")).copy()
        require(set(originals) == COVERAGE_POSES, "Missing reviewed source frame")
        protections = {fid: protected_mask(rows[fid]) & (pixels[:, :, 3] > 0)
                       for fid, pixels in originals.items()}
        return verify_served_coverage(
            item_id, Path(historical_path), historical_pin, Path(served_path),
            list(catalog_items(catalog)), review, permissions, traces, rows,
            protections, originals, template)


def main():
    source_path = ROOT / "docs/kling-motion/exports/female.character.zip"
    require(file_sha(source_path) == SOURCE_SHA, "Original female CharacterPack changed")
    with zipfile.ZipFile(source_path) as source:
        source_manifest = json.loads(source.read("manifest.json"))
    source_ids = {row["id"] for row in source_manifest["frames"]}
    catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_text())
    catalog_entries = list(catalog_items(catalog))
    audit = json.loads((ROOT / "artwork/kling-repair-handoff/female/asset-audit.json").read_text())
    require(audit["sourceSha256"] == SOURCE_SHA and audit["registrationSha256"] == REGISTRATION_SHA,
            "Authoring audit source pins differ from approved baseline")
    results, coverage_results = [], []
    coverage_review, permissions, traces = coverage_evidence()
    original_frames = {}

    with zipfile.ZipFile(ROOT / "docs/kling-wardrobe/templates/female.wardrobe-template.zip") as template, \
            tempfile.TemporaryDirectory(prefix="female-repair-history-") as historical_directory:
        registration_bytes = template.read("registration.json")
        require(hashlib.sha256(registration_bytes).hexdigest() == REGISTRATION_SHA,
                "Registration bytes changed")
        registration = json.loads(registration_bytes)
        rows = {row["frameId"]: row for row in registration["frames"]}
        require(len(rows) == 96 and set(rows) == source_ids, "Expected all 96 registered source poses")
        protections = {fid: protected_mask(row) for fid, row in rows.items()}
        # Match the runtime protection contract: regions protect every visible
        # source pixel, including antialiased edges; transparent padding inside
        # a polygon may still be garment-owned. Decode one source alpha page at
        # a time instead of retaining large RGBA source atlases.
        source_pages = [source_manifest["spritesheet"], *source_manifest.get("additionalSheets", [])]
        with zipfile.ZipFile(source_path) as source:
            for page_index, page in enumerate(source_pages):
                with Image.open(io.BytesIO(source.read(page["file"]))) as image:
                    alpha = np.asarray(image.getchannel("A"))
                    for frame in source_manifest["frames"]:
                        if frame.get("page", 0) == page_index and frame["id"] in COVERAGE_POSES:
                            x, y, w, h = frame["x"], frame["y"], frame["width"], frame["height"]
                            original_frames[frame["id"]] = np.asarray(
                                image.crop((x, y, x + w, y + h)).convert("RGBA")).copy()
                require(alpha.shape == (page["height"], page["width"]), "Source page dimensions")
                for frame in source_manifest["frames"]:
                    if frame.get("page", 0) != page_index:
                        continue
                    x, y, w, h = frame["x"], frame["y"], frame["width"], frame["height"]
                    require((h, w, 4) == FRAME_SHAPE, "Source native frame dimensions")
                    protections[frame["id"]] &= alpha[y:y + h, x:x + w] != 0
                del alpha
        tank_masks = {
            fid: np.asarray(Image.open(io.BytesIO(template.read(f"masks/{fid:03d}/tank.png")))) > 0
            for fid in EXPECTED
        }

        for prefix, pins in PINS.items():
            folder = ROOT / "docs/kling-wardrobe/garments/female"
            authored = ROOT / f"artwork/kling-repair-handoff/female/{prefix}-v9.zip"
            baseline_url = f"docs/kling-wardrobe/garments/female/{prefix}-v8.zip"
            historical_bytes = subprocess.check_output(
                ["git", "show", f"{HISTORICAL_REVISION}:{baseline_url}"], cwd=ROOT)
            require(hashlib.sha256(historical_bytes).hexdigest() == pins["baseline"],
                    f"{prefix}: merged historical baseline differs from original pin")
            historical_path = Path(historical_directory) / f"{prefix}-v8.zip"
            historical_path.write_bytes(historical_bytes)
            del historical_bytes
            paths = {"baseline": historical_path, "donor": folder / f"{prefix}.zip",
                     "candidate": authored}
            for role, path in paths.items():
                require(file_sha(path) == pins[role], f"{prefix} {role} SHA256 changed")
            require(file_sha(authored) == pins["candidate"], f"{prefix} published/authored ZIP differ")
            entries = [entry for entry in catalog_entries if entry["id"] == f"{prefix}-v9"]
            require(len(entries) == 1, f"{prefix} candidate must appear once in catalog")
            entry = entries[0]
            served_candidate = folder / f"{prefix}-v9.zip"
            require(entry["url"] == "/" + str(served_candidate.relative_to(ROOT)), "Catalog candidate URL")
            require(entry["sha256"] == coverage_review[entry["id"]]["afterSha256"] and
                    entry["bytes"] == served_candidate.stat().st_size,
                    "Catalog candidate integrity metadata")
            audit_entry = next(item for item in audit["items"] if item["id"] == entry["id"])
            require(audit_entry["baselineSha256"] == pins["baseline"] and
                    audit_entry["donorSha256"] == pins["donor"], "Authoring audit baseline/donor drift")
            require(audit_entry["item"]["sha256"] == pins["candidate"] and
                    audit_entry["item"]["bytes"] == authored.stat().st_size,
                    "Historical published candidate integrity metadata changed")
            changes = []
            with ExitStack() as stack:
                readers = {role: GarmentReader(stack.enter_context(zipfile.ZipFile(path)))
                           for role, path in paths.items()}
                for reader in readers.values():
                    require(set(reader.frames) == set(rows), "Incomplete registered frame coverage")
                for fid in sorted(rows):
                    base, owned = readers["baseline"].frame(fid)
                    donor, donor_owned = readers["donor"].frame(fid)
                    candidate, candidate_owned = readers["candidate"].frame(fid)
                    require(np.array_equal(owned, candidate_owned), f"{prefix}/{fid}: ownership changed")
                    require(np.array_equal(base[:, :, 3], candidate[:, :, 3]), f"{prefix}/{fid}: alpha changed")
                    protected = protections[fid]
                    require(not np.any(candidate_owned & protected), f"{prefix}/{fid}: owns protected source head/hand")
                    changed = np.any(base != candidate, axis=2)
                    require(not np.any(changed & ~owned), f"{prefix}/{fid}: changed unowned source")
                    require(not np.any(changed & protected), f"{prefix}/{fid}: changed source head/hand")
                    if fid not in EXPECTED:
                        require(not changed.any(), f"{prefix}/{fid}: unreviewed pose changed")
                        continue
                    count, bounds = EXPECTED[fid]
                    ys, xs = np.where(changed)
                    require(len(xs) == count, f"{prefix}/{fid}: RGB delta count changed")
                    actual_bounds = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
                    require(actual_bounds == bounds, f"{prefix}/{fid}: changed bounds escaped review")
                    require(not np.any(changed & ~tank_masks[fid]), f"{prefix}/{fid}: edits outside source tank")
                    require(not np.any(changed & ~donor_owned), f"{prefix}/{fid}: donor lacks owned cloth")
                    b, d, c = base[changed, :3], donor[changed, :3], candidate[changed, :3]
                    require(np.all(c >= np.minimum(b, d)) and np.all(c <= np.maximum(b, d)),
                            f"{prefix}/{fid}: RGB outside existing painted donor/baseline range")
                    changes.append({"frameId": fid, "changedRgbPixels": count, "bounds": actual_bounds})
            results.append({"id": entry["id"], "decodedFrames": 96, "unchangedRgbaFrames": 94,
                            "alphaAndOwnershipExact": True, "protectedSourceHeadHandsUntouched": True,
                            "historicalPublishedCopyExact": True, "changes": changes})
            for version, role in [(8, "baseline"), (9, "candidate")]:
                item_id = f"{prefix}-v{version}"
                coverage_results.append(verify_served_coverage(
                    item_id, paths[role], pins[role], folder / f"{item_id}.zip",
                    catalog_entries, coverage_review, permissions, traces, rows,
                    protections, original_frames, template))
    print(json.dumps({"status": "passed", "readOnly": True, "sourceAndRegistrationPinned": True,
                      "historicalRevision": HISTORICAL_REVISION,
                      "garmentFramesDecoded": 576, "items": results,
                      "coverageGarmentFramesDecoded": 768,
                      "servedCoverageChain": coverage_results}, indent=2))


if __name__ == "__main__":
    main()
