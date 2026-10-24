#!/usr/bin/env python3
"""Read-only regression guard for the additive female V9 forearm repair.

This does not invoke the authoring script or write assets. It decodes the
published candidate, V8 baseline and V1 donor independently, and checks the
reviewed delta and original protection rules for all registered poses.
"""
import hashlib
import io
import json
import zipfile
from contextlib import ExitStack

import numpy as np
from PIL import Image

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
    results = []

    with zipfile.ZipFile(ROOT / "docs/kling-wardrobe/templates/female.wardrobe-template.zip") as template:
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
            paths = {"baseline": folder / f"{prefix}-v8.zip", "donor": folder / f"{prefix}.zip",
                     "candidate": folder / f"{prefix}-v9.zip"}
            for role, path in paths.items():
                require(file_sha(path) == pins[role], f"{prefix} {role} SHA256 changed")
            authored = ROOT / f"artwork/kling-repair-handoff/female/{prefix}-v9.zip"
            require(file_sha(authored) == pins["candidate"], f"{prefix} published/authored ZIP differ")
            entries = [entry for entry in catalog_entries if entry["id"] == f"{prefix}-v9"]
            require(len(entries) == 1, f"{prefix} candidate must appear once in catalog")
            entry = entries[0]
            require(entry["url"] == "/" + str(paths["candidate"].relative_to(ROOT)), "Catalog candidate URL")
            require(entry["sha256"] == pins["candidate"] and entry["bytes"] == authored.stat().st_size,
                    "Catalog candidate integrity metadata")
            audit_entry = next(item for item in audit["items"] if item["id"] == entry["id"])
            require(audit_entry["baselineSha256"] == pins["baseline"] and
                    audit_entry["donorSha256"] == pins["donor"], "Authoring audit baseline/donor drift")
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
                            "publishedCopyExact": True, "changes": changes})
    print(json.dumps({"status": "passed", "readOnly": True, "sourceAndRegistrationPinned": True,
                      "garmentFramesDecoded": 576, "items": results}, indent=2))


if __name__ == "__main__":
    main()
