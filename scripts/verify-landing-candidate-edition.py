#!/usr/bin/env python3
"""Read-only pixel and binding audit between two male landing asset editions.

Only raw source frame108 and daily garment frame108 may change. Wedding frames
require an explicit --allowed-garment-changes JSON object, for example:
  {"weddingTop": [48, 89, 108], "male-wedding-bottom.garment.zip": [108]}
Keys may be the exact four garment filenames or their catalog logical keys
(dailyTop, dailyBottom, weddingTop, weddingBottom). Daily lists can narrow but
cannot broaden the default [108]. Missing wedding lists mean no changes.

Garments are compared as full native patch RGBA plus binary ownership alpha;
repacking unchanged native crops into different atlas positions is harmless.
Frame108's copied head is independently checked against visible source89 RGBA
selected by the unchanged reference ZIP mask, at the fixed(-18,-14) offset.
Changed source/registration bindings require a consecutive edition number and
an exact previous-edition record shared by the catalog and source metadata.
All other input files remain read-only. The report must be outside both asset
directories. A failed comparison still writes its report and exits nonzero.

Dependencies: Python standard library and Pillow. This is an integrity audit,
not visual acceptance or a replacement for runtime parser/playback validation.
"""
from __future__ import annotations

import argparse
from functools import reduce
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

from PIL import Image, ImageChops

FRAME_IDS = list(range(109))
NATIVE_SIZE = (512, 768)
GARMENTS = {
    "dailyTop": "male-daily-top.garment.zip",
    "dailyBottom": "male-daily-bottom.garment.zip",
    "weddingTop": "male-wedding-top.garment.zip",
    "weddingBottom": "male-wedding-bottom.garment.zip",
}
BINDINGS = {"sourceSha256", "registrationSha256"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def omit(value: dict, keys: set[str]) -> dict:
    return {key: item for key, item in value.items() if key not in keys}


def changed_paths(before, after, prefix="") -> list[str]:
    if type(before) is not type(after):
        return [prefix or "$"]
    if isinstance(before, dict):
        output = []
        for key in sorted(set(before) | set(after)):
            path = f"{prefix}.{key}" if prefix else key
            if key not in before or key not in after:
                output.append(path)
            else:
                output.extend(changed_paths(before[key], after[key], path))
        return output
    if isinstance(before, list):
        if len(before) != len(after):
            return [f"{prefix}.length"]
        return [path for index, (left, right) in enumerate(zip(before, after))
                for path in changed_paths(left, right, f"{prefix}[{index}]")]
    return [] if before == after else [prefix or "$"]


def frame_map(rows: list[dict], key: str, label: str) -> dict[int, dict]:
    require(isinstance(rows, list), f"{label}: frames must be an array")
    ids = [row[key] for row in rows]
    require(all(type(frame_id) is int for frame_id in ids), f"{label}: frame IDs must be integers")
    require(sorted(ids) == FRAME_IDS, f"{label}: must contain each frame0..108 exactly once")
    return {row[key]: row for row in rows}


def image_difference(before: Image.Image, after: Image.Image, offset_y=0) -> dict:
    require(before.size == after.size and before.mode == after.mode, "Compared images have different dimensions/modes")
    difference = ImageChops.difference(before, after)
    # RGBA.getbbox() defaults to alpha-only in Pillow; explicitly combine every
    # channel so an opaque RGB change cannot disappear from the pixel audit.
    union = reduce(ImageChops.lighter, difference.split())
    changed = union.point([0] + [255] * 255)
    bounds = changed.getbbox()
    return {
        "changedPixels": changed.histogram()[255],
        "bbox": [bounds[0], bounds[1] + offset_y, bounds[2], bounds[3] + offset_y] if bounds else None,
    }


class Archive:
    def __init__(self, path: Path):
        self.path = path
        self.bytes = path.read_bytes()
        self.sha256 = sha(self.bytes)
        with zipfile.ZipFile(io.BytesIO(self.bytes)) as archive:
            names = archive.namelist()
            require(len(names) == len(set(names)), f"{path.name}: duplicate ZIP entry")
            self.files = {name: archive.read(name) for name in names}
        self.manifest = json.loads(self.files["manifest.json"])
        self._images = {}

    def image(self, filename: str) -> Image.Image:
        if filename not in self._images:
            image = Image.open(io.BytesIO(self.files[filename]))
            require(image.format == "PNG" and image.mode == "RGBA", f"{self.path.name}/{filename}: expected RGBA PNG")
            require(not getattr(image, "is_animated", False), f"{filename}: expected static PNG")
            image.load()
            self._images[filename] = image
        return self._images[filename]


class Source(Archive):
    def __init__(self, path: Path):
        super().__init__(path)
        self.recipe = json.loads(self.files["character.json"])
        self.frames = frame_map(self.manifest["frames"], "id", path.name)
        self.sheets = [self.manifest["spritesheet"], *self.manifest.get("additionalSheets", [])]
        require(len(self.sheets) == 4, f"{path.name}: expected original three sheets plus candidate sheet")
        require(self.manifest["schemaVersion"] == 3, f"{path.name}: expected V3 source")
        for sheet in self.sheets:
            require((sheet["frameWidth"], sheet["frameHeight"]) == NATIVE_SIZE, "Source native dimensions changed")

    def frame(self, frame_id: int) -> Image.Image:
        frame = self.frames[frame_id]
        require((frame["width"], frame["height"]) == NATIVE_SIZE, f"Source frame{frame_id}: wrong native dimensions")
        page = frame.get("page", 0)
        require(type(page) is int and 0 <= page < len(self.sheets), f"Source frame{frame_id}: invalid page")
        sheet = self.sheets[page]
        image = self.image(sheet["file"])
        require(image.size == (sheet["width"], sheet["height"]), "Source sheet dimensions do not match PNG")
        x, y = frame["x"], frame["y"]
        require(type(x) is int and type(y) is int and x >= 0 and y >= 0
                and x + 512 <= image.width and y + 768 <= image.height, f"Source frame{frame_id}: invalid crop")
        return image.crop((x, y, x + 512, y + 768))


class Garment(Archive):
    def __init__(self, path: Path):
        super().__init__(path)
        self.frames = frame_map(self.manifest["frames"], "frameId", path.name)
        require((self.manifest["frameWidth"], self.manifest["frameHeight"]) == NATIVE_SIZE,
                f"{path.name}: wrong native dimensions")

    def frame(self, frame_id: int) -> tuple[Image.Image, Image.Image]:
        frame = self.frames[frame_id]
        page = frame["page"]
        require(type(page) is int and 0 <= page < len(self.manifest["pages"]), f"Garment frame{frame_id}: invalid page")
        sheet = self.manifest["pages"][page]
        patch_page, mask_page = self.image(sheet["file"]), self.image(sheet["maskFile"])
        require(patch_page.size == mask_page.size == (sheet["width"], sheet["height"]), "Garment page dimensions mismatch")
        rect, offset = frame["rect"], frame["offset"]
        values = [rect[key] for key in ("x", "y", "width", "height")] + [offset[key] for key in ("x", "y")]
        require(all(type(value) is int for value in values), "Garment crop/offset must be integer native coordinates")
        x, y, width, height, ox, oy = values
        require(x >= 0 and y >= 0 and width > 0 and height > 0
                and x + width <= patch_page.width and y + height <= patch_page.height
                and ox >= 0 and oy >= 0 and ox + width <= 512 and oy + height <= 768, "Garment crop/offset exceeds bounds")
        box = (x, y, x + width, y + height)
        patch = patch_page.crop(box)
        ownership = mask_page.getchannel("A").crop(box)
        require(not any(ownership.histogram()[1:255]), "Garment ownership alpha must be binary")
        require(not ImageChops.subtract(patch.getchannel("A"), ownership).getbbox(), "Garment artwork extends outside ownership")
        native_patch = Image.new("RGBA", NATIVE_SIZE)
        native_ownership = Image.new("L", NATIVE_SIZE)
        native_patch.paste(patch, (ox, oy))
        native_ownership.paste(ownership, (ox, oy))
        return native_patch, native_ownership


class Audit:
    def __init__(self, before: Path, after: Path, lower_from_y: int | None, allowed: dict[str, list[int]]):
        self.before, self.after = before, after
        self.errors = []
        self.report = {
            "format": "gathria-landing-candidate-edition-audit", "version": 1,
            "before": str(before), "after": str(after),
            "visualAcceptance": "not-assessed",
            "pixelComparison": "Exact decoded RGBA; changedPixels counts pixels with any differing channel; bbox is [left,top,right,bottom] with exclusive right/bottom.",
            "garmentOwnershipComparison": "Binary alpha in native coordinates; ownership RGB has no runtime meaning.",
            "policy": {"sourceAllowedFrames": [108], "lowerFromY": lower_from_y, "allowedGarmentChanges": allowed},
            "source": {}, "head": {}, "registration": {}, "appearance": {}, "garments": {}, "catalog": {},
            "errors": self.errors,
        }

    def check(self, condition: bool, code: str, message: str, **details):
        if not condition:
            self.errors.append({"code": code, "message": message, **details})

    def part(self, name: str, callback):
        try:
            callback()
        except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, IndexError) as failure:
            self.errors.append({"code": f"{name}-input-error", "message": str(failure)})

    def run(self):
        self.sources = [Source(directory / "male.source.zip") for directory in (self.before, self.after)]
        self.reg_bytes = [(directory / "male.registration.json").read_bytes() for directory in (self.before, self.after)]
        self.registrations = [json.loads(data) for data in self.reg_bytes]
        self.catalogs = [json.loads((directory / "catalog.json").read_bytes()) for directory in (self.before, self.after)]
        for name, callback in (("source", self.source), ("head", self.head), ("registration", self.registration), ("appearance", self.appearance), ("catalog", self.catalog)):
            self.part(name, callback)
        for logical, filename in GARMENTS.items():
            self.part(filename, lambda logical=logical, filename=filename: self.garment(logical, filename))

    def source(self):
        before, after = self.sources
        section = self.report["source"]
        section.update({"beforeSha256": before.sha256, "afterSha256": after.sha256, "changedFrames": [], "frameChanges": []})
        for key in ("animations", "anchor", "facing", "scale", "capabilities"):
            self.check(before.manifest[key] == after.manifest[key], f"source-{key}-changed", f"Source {key} must remain unchanged")
        self.check(before.recipe["characterId"] == after.recipe["characterId"], "source-character-changed", "Logical source characterId must remain unchanged")
        self.check(before.recipe["derivation"]["frames"] == after.recipe["derivation"]["frames"],
                   "source-frame-mapping-changed", "Source frame derivation indices/timing must remain unchanged")
        original_sheets = []
        for page in range(3):
            left, right = before.sheets[page], after.sheets[page]
            same = left == right and before.files[left["file"]] == after.files[right["file"]]
            original_sheets.append({"page": page, "file": left["file"], "byteExact": same})
            self.check(same, "original-source-sheet-changed", "Original three source sheets and their descriptors must remain byte-exact", page=page)
        section["originalSheets"] = original_sheets
        for frame_id in FRAME_IDS:
            left, right = before.frame(frame_id), after.frame(frame_id)
            difference = image_difference(left, right)
            if difference["changedPixels"]:
                section["changedFrames"].append(frame_id)
                section["frameChanges"].append({"frameId": frame_id, **difference})
                self.check(frame_id == 108, "source-frame-unexpected-change", "Only source frame108 may change", frameId=frame_id, **difference)
            if frame_id == 108 and self.report["policy"]["lowerFromY"] is not None:
                y = self.report["policy"]["lowerFromY"]
                lower = image_difference(left.crop((0, y, 512, 768)), right.crop((0, y, 512, 768)), offset_y=y)
                section["frame108LowerBand"] = {"fromY": y, **lower}
                self.check(lower["changedPixels"] == 0, "source108-lower-band-changed", "Frame108 pixels at or below the requested row must remain exact", **lower)
        section["sourceActionsFpsLoopsFacingAnchorExact"] = all(before.manifest[key] == after.manifest[key] for key in ("animations", "facing", "anchor"))
        for directory, source, label in zip((self.before, self.after), self.sources, ("before", "after")):
            reference = directory / "male-landing-reference.zip"
            self.check(source.recipe["source"]["sha256"] == sha(reference.read_bytes()), "source-reference-binding-mismatch", "Source reference ZIP checksum mismatch", edition=label)

    def head(self):
        masks = []
        for directory in (self.before, self.after):
            with zipfile.ZipFile(directory / "male-landing-reference.zip") as reference:
                masks.append(reference.read("source89-head-copy-mask.png"))
        self.check(masks[0] == masks[1], "head-copy-mask-changed", "Source89 head copy mask bytes must remain unchanged")
        mask_image = Image.open(io.BytesIO(masks[0]))
        require(mask_image.format == "PNG" and mask_image.size == NATIVE_SIZE, "Head copy mask must be a native512x768 PNG")
        require(mask_image.mode in ("RGBA", "L"), "Head copy mask must use RGBA alpha or L")
        mask = mask_image.getchannel("A") if mask_image.mode == "RGBA" else mask_image
        require(not any(mask.histogram()[1:255]), "Head copy mask must be binary")
        baseline = self.sources[0].frame(89)
        baseline_pixels = baseline.load()
        coordinates = [(index % 512, index // 512) for index, alpha in enumerate(mask.tobytes())
                       if alpha and baseline_pixels[index % 512, index // 512][3] > 0]
        self.check(len(coordinates) >= 10000, "head-copy-mask-too-small", "Head copy mask must cover at least10000 visible baseline head pixels", visiblePixels=len(coordinates))
        section = self.report["head"]
        section.update({"sourceFrameId": 89, "sourceFrameRgbaSha256": sha(baseline.tobytes()),
                        "sourceCoordinateMaskSha256": sha(masks[0]), "maskBytesUnchanged": masks[0] == masks[1],
                        "translation": {"x": -18, "y": -14}, "visibleHeadPixels": len(coordinates), "editions": []})
        for source, label in zip(self.sources, ("before", "after")):
            metadata = source.recipe["sourceMetadata"]["landingCandidate"]
            self.check(metadata["headSourceFrameId"] == 89
                       and metadata["headTranslations"]["108"] == {"x": -18, "y": -14},
                       "head-copy-transform-changed", "Frame108 must retain source89 and the exact(-18,-14) head translation", edition=label)
            pixels = source.frame(108).load()
            clipped = 0
            changes = []
            for x, y in coordinates:
                tx, ty = x - 18, y - 14
                if not (0 <= tx < 512 and 0 <= ty < 768):
                    clipped += 1
                elif pixels[tx, ty] != baseline_pixels[x, y]:
                    changes.append((tx, ty))
            bounds = ([min(x for x, _ in changes), min(y for _, y in changes),
                       max(x for x, _ in changes) + 1, max(y for _, y in changes) + 1] if changes else None)
            result = {"edition": label, "frameId": 108, "copiedHeadPixels": len(coordinates) - clipped,
                      "clippedPixels": clipped, "changedPixels": len(changes), "bbox": bounds}
            section["editions"].append(result)
            self.check(clipped == 0, "head-copy-clipped", "No copied source head pixel may be clipped", **result)
            self.check(not changes, "head-copy-rgba-changed", "Copied frame108 head pixels must equal the visible masked source89 RGBA exactly", **result)

    def registration(self):
        before, after = self.registrations
        section = self.report["registration"]
        section.update({"beforeSha256": sha(self.reg_bytes[0]), "afterSha256": sha(self.reg_bytes[1]), "changedFrames": [], "frameChanges": []})
        self.check(omit(before, {"sourceSha256", "frames"}) == omit(after, {"sourceSha256", "frames"}),
                   "registration-metadata-changed", "Registration metadata other than source binding must remain unchanged")
        maps = [frame_map(reg["frames"], "frameId", "registration") for reg in self.registrations]
        for frame_id in FRAME_IDS:
            left, right = maps[0][frame_id], maps[1][frame_id]
            paths = changed_paths(left, right)
            if paths:
                section["changedFrames"].append(frame_id)
                section["frameChanges"].append({"frameId": frame_id, "changedPaths": paths})
            if frame_id != 108:
                self.check(not paths, "registration-frame-unexpected-change", "Registration frames0..107 must remain exact", frameId=frame_id)
            else:
                self.check(omit(left, {"points", "protected"}) == omit(right, {"points", "protected"}),
                           "registration108-identity-changed", "Only frame108 points and hand protection may change")
                self.check(set(left["points"]) == set(right["points"]), "registration108-anchor-keys-changed", "Frame108 must retain the same named anchors")
                heads = [[region for region in row["protected"] if region["label"] == "head"] for row in (left, right)]
                self.check(len(heads[0]) == len(heads[1]) == 1 and heads[0] == heads[1],
                           "registration108-head-changed", "Frame108 head protection polygon must remain exactly unchanged")
                for row in (left, right):
                    labels = [region["label"] for region in row["protected"]]
                    self.check(len(labels) == len(set(labels)) and set(labels) <= {"head", "nearHand", "farHand"},
                               "registration108-protected-labels-invalid", "Frame108 protection must contain distinct supported head/hand labels")
        for reg, source, label in zip(self.registrations, self.sources, ("before", "after")):
            self.check(reg["sourceSha256"] == source.sha256, "registration-source-binding-mismatch", "Registration must bind its own source ZIP", edition=label)

    def appearance(self):
        before, after = [Archive(directory / "male.appearance.zip") for directory in (self.before, self.after)]
        paths = changed_paths(omit(before.manifest, BINDINGS), omit(after.manifest, BINDINGS))
        section = self.report["appearance"]
        section.update({"beforeSha256": before.sha256, "afterSha256": after.sha256,
                        "changedManifestPaths": paths, "changedPngFiles": [], "pngChanges": []})
        self.check(not paths, "appearance-data-changed", "Every appearance style, crop, pose and other manifest field must remain exact except source/registration bindings", changedPaths=paths)
        before_pngs = {name for name in before.files if name.endswith(".png")}
        after_pngs = {name for name in after.files if name.endswith(".png")}
        self.check(before_pngs == after_pngs, "appearance-png-inventory-changed", "Appearance PNG inventory must remain exact")
        for filename in sorted(before_pngs | after_pngs):
            exact = before.files.get(filename) == after.files.get(filename)
            if not exact:
                section["changedPngFiles"].append(filename)
                change = {"file": filename, "byteExact": False}
                if filename in before_pngs & after_pngs:
                    left, right = before.image(filename), after.image(filename)
                    if left.size == right.size:
                        change.update(image_difference(left, right))
                section["pngChanges"].append(change)
                self.check(False, "appearance-png-changed", "Appearance PNG bytes must remain exact", file=filename)
        self.bindings(before.manifest, 0, "appearance")
        self.bindings(after.manifest, 1, "appearance")

    def bindings(self, manifest: dict, edition: int, label: str):
        source, registration = self.sources[edition], self.registrations[edition]
        self.check(manifest["sourceSha256"] == source.sha256
                   and manifest["registrationSha256"] == sha(self.reg_bytes[edition])
                   and manifest["characterId"] == registration["characterId"] == source.recipe["characterId"],
                   "asset-binding-mismatch", f"{label} must bind its own edition's source, registration and character", edition=("before", "after")[edition])

    def garment(self, logical: str, filename: str):
        before, after = [Garment(directory / filename) for directory in (self.before, self.after)]
        allowed = self.report["policy"]["allowedGarmentChanges"][filename]
        section = {"logicalKey": logical, "beforeSha256": before.sha256, "afterSha256": after.sha256,
                   "allowedFrames": allowed, "changedFrames": [], "frameChanges": []}
        self.report["garments"][filename] = section
        ignored = BINDINGS | {"pages", "frames", "provenance"}
        paths = changed_paths(omit(before.manifest, ignored), omit(after.manifest, ignored))
        section["changedMetadataPaths"] = paths
        self.check(not paths, "garment-metadata-changed", "Garment identity, slot, geometry contract and protection reviews must remain unchanged", file=filename, changedPaths=paths)
        self.bindings(before.manifest, 0, filename)
        self.bindings(after.manifest, 1, filename)
        for frame_id in FRAME_IDS:
            left_patch, left_mask = before.frame(frame_id)
            right_patch, right_mask = after.frame(frame_id)
            patch = image_difference(left_patch, right_patch)
            ownership = image_difference(left_mask, right_mask)
            if patch["changedPixels"] or ownership["changedPixels"]:
                section["changedFrames"].append(frame_id)
                change = {"frameId": frame_id, "patchRgba": patch, "ownershipAlpha": ownership}
                section["frameChanges"].append(change)
                self.check(frame_id in allowed, "garment-frame-unexpected-change", "Garment frame is outside its explicit change allowance", file=filename, **change)

    def catalog(self):
        before, after = self.catalogs
        section = self.report["catalog"]
        first_error = len(self.errors)
        keys = ("characterId", "frameCount", "garmentIds", "presets")
        changed = [key for key in keys if before[key] != after[key]]
        section["changedIdentityOrPresetFields"] = changed
        self.check(not changed, "catalog-identity-presets-changed", "Catalog logical character, garment IDs and presets must remain unchanged", fields=changed)
        for index, catalog in enumerate(self.catalogs):
            self.bindings(catalog, index, "catalog")
            self.check(catalog["frameCount"] == 109, "catalog-frame-count-invalid", "Catalog must declare109 frames", edition=("before", "after")[index])
        editions = [catalog.get("edition", 1) for catalog in self.catalogs]
        valid_editions = all(type(edition) is int and edition >= 1 for edition in editions)
        self.check(valid_editions, "catalog-edition-invalid", "Edition numbers must be positive integers")
        bindings_changed = (self.sources[0].sha256 != self.sources[1].sha256
                            or sha(self.reg_bytes[0]) != sha(self.reg_bytes[1]))
        section.update({"beforeEdition": editions[0], "afterEdition": editions[1], "bindingsChanged": bindings_changed})
        for index, (catalog, source) in enumerate(zip(self.catalogs, self.sources)):
            metadata = source.recipe["sourceMetadata"]["landingCandidate"]
            require(isinstance(metadata, dict), "Source landingCandidate metadata must be an object")
            source_edition = metadata.get("edition", 1)
            consistent = (type(source_edition) is int and source_edition == editions[index]
                          and not changed_paths(catalog.get("previousEdition"), metadata.get("previousEdition")))
            self.check(consistent, "source-catalog-lineage-mismatch", "Source edition/previousEdition metadata must match its catalog", edition=("before", "after")[index])
        if bindings_changed:
            self.check(valid_editions and after.get("edition") == editions[0] + 1,
                       "catalog-edition-not-incremented", "Changed bindings require the next consecutive explicit catalog edition")
            expected_previous = {"edition": editions[0], "sourceSha256": self.sources[0].sha256,
                                 "registrationSha256": sha(self.reg_bytes[0])}
            section["expectedPreviousEdition"] = expected_previous
            self.check(not changed_paths(expected_previous, after.get("previousEdition")),
                       "catalog-previous-edition-mismatch", "previousEdition must identify the exact before edition and actual source/registration SHA256 values")
        else:
            self.check(editions[0] == editions[1]
                       and not changed_paths(before.get("previousEdition"), after.get("previousEdition")),
                       "catalog-lineage-changed-without-binding", "Unchanged bindings must retain their existing edition lineage")
        section["lineageVerified"] = len(self.errors) == first_error


def allowances(path: Path | None) -> dict[str, list[int]]:
    result = {filename: [108] if key.startswith("daily") else [] for key, filename in GARMENTS.items()}
    if path is None:
        return result
    raw = json.loads(path.read_bytes())
    require(isinstance(raw, dict), "Garment change allowance must be an object mapping exact filenames/logical keys to ID arrays")
    aliases = {**GARMENTS, **{filename: filename for filename in GARMENTS.values()}}
    supplied = set()
    for key, frames in raw.items():
        require(key in aliases, f"Unknown garment allowance key: {key}")
        filename = aliases[key]
        require(filename not in supplied, f"Multiple aliases supplied for garment: {filename}")
        supplied.add(filename)
        require(isinstance(frames, list) and all(type(frame_id) is int and frame_id in FRAME_IDS for frame_id in frames)
                and len(frames) == len(set(frames)), f"{key}: supply distinct explicit frame IDs0..108; wildcards are forbidden")
        require(not filename.startswith("male-daily-") or set(frames) <= {108}, "Daily garment allowance cannot extend beyond frame108")
        result[filename] = sorted(frames)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--lower-from-y", type=int)
    parser.add_argument("--allowed-garment-changes", type=Path)
    args = parser.parse_args()
    before, after, report_path = args.before.resolve(), args.after.resolve(), args.report.resolve()
    require(not report_path.is_relative_to(before) and not report_path.is_relative_to(after),
            "Report output must be outside both read-only asset directories")
    require(not args.allowed_garment_changes or report_path != args.allowed_garment_changes.resolve(),
            "Report output must not overwrite the input allowance JSON")
    initial_error = None
    try:
        require(args.lower_from_y is None or 0 <= args.lower_from_y <= 768, "--lower-from-y must be between0 and768")
        allowed = allowances(args.allowed_garment_changes)
    except (ValueError, OSError, TypeError) as failure:
        allowed = allowances(None)
        initial_error = str(failure)
    audit = Audit(before, after, args.lower_from_y, allowed)
    if initial_error:
        audit.errors.append({"code": "invalid-policy", "message": initial_error})
    else:
        audit.part("edition", audit.run)
    audit.report["passed"] = not audit.errors
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(audit.report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": audit.report["passed"], "errors": len(audit.errors),
                      "sourceChangedFrames": audit.report["source"].get("changedFrames", []), "report": str(report_path)}))
    return 0 if audit.report["passed"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as failure:
        print(str(failure), file=sys.stderr)
        sys.exit(2)
