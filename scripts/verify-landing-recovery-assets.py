#!/usr/bin/env python3
"""Read-only V3→V4 landing-art integrity audit, separate from the V2/V3 gates.

Only authored source/cloth frames107 and108 and their registration may change.
Both copied heads must equal the original source89 RGBA at the explicitly
declared integer translations. Appearance PNGs/crops stay exact; only those
two frames' offsets and head geometry may follow the same translations.

This checks preservation, lineage and coordinates, not anatomical correctness
or visual acceptance. Use --profiles after registering the V4 runtime profile
to additionally verify unchanged basic actions, including the single jump.
All asset and input files are read-only; only --report is written.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import io
import json
import math
from pathlib import Path
import sys
import zipfile

from PIL import Image


MODULE_SPEC = importlib.util.spec_from_file_location(
    "landing_edition_integrity", Path(__file__).with_name("verify-landing-candidate-edition.py")
)
assert MODULE_SPEC and MODULE_SPEC.loader
base = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(base)

NEW_IDS = (107, 108)
ANCHORS = set((
    "neck nearShoulder farShoulder waistLeft waistRight nearHip farHip "
    "nearElbow farElbow nearWrist farWrist nearKnee farKnee nearAnkle farAnkle nearToe farToe"
).split())


def translated(value, dx, dy):
    """Translate geometry only; preserve every other scalar and array entry."""
    if isinstance(value, list):
        return [translated(item, dx, dy) for item in value]
    if isinstance(value, dict):
        result = {key: translated(item, dx, dy) for key, item in value.items()}
        if "x" in result and "y" in result:
            result["x"] += dx
            result["y"] += dy
        return result
    return value


def valid_point(point):
    return (isinstance(point, dict)
            and all(type(point.get(key)) in (int, float) and math.isfinite(point[key])
                    for key in ("x", "y"))
            and 0 <= point["x"] <= 512 and 0 <= point["y"] <= 768)


def referenced_input_files(value, directory):
    """Protect even provenance artwork paths from a mistaken report target."""
    if isinstance(value, dict):
        return set().union(*(referenced_input_files(item, directory) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(referenced_input_files(item, directory) for item in value))
    if isinstance(value, str) and value and "\n" not in value:
        try:
            path = (directory / value).resolve()
            return {path} if path.is_file() else set()
        except (OSError, ValueError):
            # Descriptive prose and arbitrary manifest metadata are not paths.
            pass
    return set()


class RecoveryAudit(base.Audit):
    def __init__(self, before, after, input_path, profiles_path=None):
        super().__init__(before, after, None, {name: list(NEW_IDS) for name in base.GARMENTS.values()})
        self.input_path = input_path
        self.profiles_path = profiles_path
        self.report.update({
            "format": "gathria-landing-recovery-art-audit",
            "input": str(input_path),
            "runtimeProfile": {"status": "not-assessed", "reason": "Supply --profiles for the separately stored gameplay contract"},
        })
        self.report["policy"].update({
            "sourceAllowedFrames": list(NEW_IDS),
            "registrationAllowedFrames": list(NEW_IDS),
            "head": "Exact source89 masked RGBA at declared integer translations; no resampling",
            "appearance": "Unchanged PNG entries/crops;107/108 offsets and geometry follow copied heads",
        })

    def part(self, name, callback):
        try:
            callback()
        except (ValueError, KeyError, TypeError, AttributeError, OSError, zipfile.BadZipFile,
                IndexError, StopIteration, OverflowError) as failure:
            self.errors.append({"code": f"{name}-input-error", "message": str(failure)})

    def run(self):
        self.spec = json.loads(self.input_path.read_bytes())
        base.require(isinstance(self.spec, dict), "V4 input must be a JSON object")
        base.require(self.spec.get("edition") == 4, "This audit accepts the explicit V4 artwork edition only")
        rows = self.spec.get("frames")
        base.require(isinstance(rows, list) and len(rows) == 2
                     and all(isinstance(row, dict) and type(row.get("frameId")) is int for row in rows)
                     and sorted(row.get("frameId") for row in rows) == list(NEW_IDS),
                     "Input must contain107/108 exactly once")
        self.inputs = {row["frameId"]: row for row in rows}
        self.shifts = {}
        for frame_id, row in self.inputs.items():
            shift = row.get("headTranslation")
            base.require(isinstance(shift, dict) and set(shift) == {"x", "y"}
                         and all(type(shift[key]) is int and -128 <= shift[key] <= 128 for key in shift),
                         f"V4 frame{frame_id} requires explicit integer headTranslation within±128")
            self.shifts[frame_id] = shift
        super().run()
        if self.profiles_path:
            self.part("runtime-profile", self.runtime_profile)

    def source(self):
        before, after = self.sources
        section = self.report["source"]
        section.update({"beforeSha256": before.sha256, "afterSha256": after.sha256,
                        "changedFrames": [], "frameChanges": []})
        self.check(before.files["manifest.json"] == after.files["manifest.json"],
                   "source-manifest-changed", "Complete source manifest, frame rectangles, clips and native FPS must remain byte-exact")
        self.check(before.recipe["characterId"] == after.recipe["characterId"],
                   "source-character-changed", "Logical source character must remain unchanged")
        self.check(before.recipe["derivation"] == after.recipe["derivation"],
                   "source-derivation-changed", "All source derivation indices and timing must remain unchanged")
        for page in range(3):
            left, right = before.sheets[page], after.sheets[page]
            self.check(left == right and before.files[left["file"]] == after.files[right["file"]],
                       "original-source-sheet-changed", "Original three source PNGs must remain byte-exact", page=page)
        for frame_id in base.FRAME_IDS:
            difference = base.image_difference(before.frame(frame_id), after.frame(frame_id))
            if difference["changedPixels"]:
                section["changedFrames"].append(frame_id)
                section["frameChanges"].append({"frameId": frame_id, **difference})
                self.check(frame_id in NEW_IDS, "source-frame-unexpected-change",
                           "Only source107/108 may change", frameId=frame_id, **difference)
            if frame_id in NEW_IDS:
                path = (self.input_path.parent / self.inputs[frame_id]["image"]).resolve()
                image = Image.open(path)
                base.require(image.format == "PNG" and image.mode == "RGBA" and image.size == base.NATIVE_SIZE,
                             f"Authored frame{frame_id} must be native RGBA PNG")
                self.check(base.image_difference(image, after.frame(frame_id))["changedPixels"] == 0,
                           "source-authored-input-mismatch", "Built source must exactly match supplied authored PNG", frameId=frame_id)
        section["sourceActionsFpsLoopsFacingAnchorExact"] = before.manifest == after.manifest
        original_archives = []
        for directory, source, label in zip((self.before, self.after), self.sources, ("before", "after")):
            reference_bytes = (directory / "male-landing-reference.zip").read_bytes()
            self.check(source.recipe["source"]["sha256"] == base.sha(reference_bytes),
                       "source-reference-binding-mismatch", "Source must bind its own reference ZIP", edition=label)
            with zipfile.ZipFile(io.BytesIO(reference_bytes)) as archive:
                original_archives.append(archive.read("original.character.zip"))
            self.check("gameplayMotion" not in source.recipe.get("sourceMetadata", {}),
                       "raw-source-gameplay-added", "Raw source must not silently embed a gameplay override")
        self.check(original_archives[0] == original_archives[1], "original-reference-changed",
                   "Original source archive in the reference ZIP must remain byte-exact")

    def head(self):
        masks = []
        for directory in (self.before, self.after):
            with zipfile.ZipFile(directory / "male-landing-reference.zip") as archive:
                masks.append(archive.read("source89-head-copy-mask.png"))
        input_mask = (self.input_path.parent / self.spec["headCopy"]["mask"]).resolve().read_bytes()
        self.check(masks[0] == masks[1] == input_mask, "head-copy-mask-changed",
                   "Original source89 mask and supplied input mask must remain byte-exact")
        image = Image.open(io.BytesIO(masks[0]))
        base.require(image.format == "PNG" and image.size == base.NATIVE_SIZE and image.mode in ("RGBA", "L"),
                     "Head mask must be native512×768 PNG using alpha or L")
        mask = image.getchannel("A") if image.mode == "RGBA" else image
        base.require(not any(mask.histogram()[1:255]), "Head mask must be binary")
        source_image = self.sources[0].frame(89)
        source = source_image.load()
        coordinates = [(index % 512, index // 512) for index, alpha in enumerate(mask.tobytes()) if alpha]
        visible = sum(source[x, y][3] > 0 for x, y in coordinates)
        self.check(visible >= 10000, "head-mask-too-small", "Head mask must cover the complete approved head", visiblePixels=visible)
        self.report["head"].update({"sourceFrameId": 89, "sourceFrameRgbaSha256": base.sha(source_image.tobytes()),
                                    "sourceCoordinateMaskSha256": base.sha(masks[0]), "visibleHeadPixels": visible,
                                    "maskBytesUnchanged": masks[0] == masks[1] == input_mask, "frames": []})
        for index, collection in enumerate(self.sources):
            label = ("before", "after")[index]
            metadata = collection.recipe["sourceMetadata"]["landingCandidate"]
            self.check(metadata["headSourceFrameId"] == 89, "head-source-changed", "Both editions must copy source89", edition=label)
            for frame_id in NEW_IDS:
                shift = metadata["headTranslations"][str(frame_id)]
                base.require(set(shift) == {"x", "y"} and all(type(shift[k]) is int for k in shift), "Invalid source head translation")
                if index == 1:
                    self.check(shift == self.shifts[frame_id], "head-transform-input-mismatch",
                               "Built source translation must match explicit V4 input", frameId=frame_id)
                pixels = collection.frame(frame_id).load()
                changes, clipped, checked = [], 0, 0
                for x, y in coordinates:
                    tx, ty = x + shift["x"], y + shift["y"]
                    if not (0 <= tx < 512 and 0 <= ty < 768):
                        clipped += source[x, y][3] > 0
                    else:
                        checked += 1
                        if pixels[tx, ty] != source[x, y]:
                            changes.append((tx, ty))
                result = {"edition": label, "frameId": frame_id, "translation": shift,
                          "visibleHeadPixels": visible, "checkedMaskedPixelsIncludingTransparent": checked,
                          "clippedVisiblePixels": clipped, "changedPixels": len(changes),
                          "bbox": [min(x for x, _ in changes), min(y for _, y in changes),
                                   max(x for x, _ in changes) + 1, max(y for _, y in changes) + 1] if changes else None}
                self.report["head"]["frames"].append(result)
                self.check(clipped == 0, "head-copy-clipped", "No visible copied head pixel may be clipped", **result)
                self.check(not changes, "head-copy-rgba-changed", "Every in-bounds masked source89 pixel must be copied exactly", **result)

    def registration(self):
        before, after = self.registrations
        section = self.report["registration"]
        section.update({"beforeSha256": base.sha(self.reg_bytes[0]), "afterSha256": base.sha(self.reg_bytes[1]),
                        "changedFrames": [], "frameChanges": []})
        self.check(base.omit(before, {"sourceSha256", "frames"}) == base.omit(after, {"sourceSha256", "frames"}),
                   "registration-metadata-changed", "Registration metadata except source binding must remain exact")
        maps = [base.frame_map(reg["frames"], "frameId", "registration") for reg in self.registrations]
        for frame_id in base.FRAME_IDS:
            left, right = maps[0][frame_id], maps[1][frame_id]
            paths = base.changed_paths(left, right)
            if paths:
                section["changedFrames"].append(frame_id)
                section["frameChanges"].append({"frameId": frame_id, "changedPaths": paths})
            if frame_id not in NEW_IDS:
                self.check(not paths, "registration-frame-unexpected-change", "Registration0..106 must remain exact", frameId=frame_id)
                continue
            expected_input = copy.deepcopy(self.inputs[frame_id]["registration"])
            expected_input.update({"frameId": frame_id, "sourceFrame": frame_id})
            self.check(right == expected_input, "registration-input-mismatch", "New registration must match reviewed input", frameId=frame_id)
            self.check(base.omit(left, {"points", "protected"}) == base.omit(right, {"points", "protected"}),
                       "registration-identity-changed", "Only new-frame points/protection may change", frameId=frame_id)
            self.check(set(right["points"]) == ANCHORS, "registration-anchor-keys-changed", "All17 named anchors are required", frameId=frame_id)
            for key, point in right["points"].items():
                self.check(valid_point(point) and point.get("visibility") in ("visible", "occluded"),
                           "registration-anchor-invalid", "Anchor must have finite in-bounds coordinates and visibility", frameId=frame_id, anchor=key)
                confidence = point.get("confidence")
                method = point.get("method")
                metadata_valid = (set(point) <= {"x", "y", "visibility", "confidence", "method"}
                                  and ("confidence" not in point or
                                       (type(confidence) in (int, float) and math.isfinite(confidence) and 0 <= confidence <= 1))
                                  and ("method" not in point or
                                       (isinstance(method, str) and method.strip()
                                        and len(method.encode("utf-16-le", errors="surrogatepass")) // 2 <= 240)))
                self.check(bool(metadata_valid), "registration-anchor-metadata-invalid",
                           "Optional anchor confidence must be0..1 and method nonempty text≤240 UTF-16 units, matching the reader", frameId=frame_id, anchor=key)
            labels = [region["label"] for region in right["protected"]]
            self.check(len(labels) == len(set(labels)) and set(labels) == {"head", "nearHand", "farHand"},
                       "registration-protected-labels-invalid", "Distinct head and both hand protections are required", frameId=frame_id)
            for region in right["protected"]:
                self.check(3 <= len(region["polygon"]) <= 64 and all(valid_point(p) for p in region["polygon"]),
                           "registration-polygon-invalid", "Protection polygon requires3..64 finite in-bounds points", frameId=frame_id, label=region["label"])
            old_head = next(region for region in left["protected"] if region["label"] == "head")
            new_head = next(region for region in right["protected"] if region["label"] == "head")
            old_shift = self.sources[0].recipe["sourceMetadata"]["landingCandidate"]["headTranslations"][str(frame_id)]
            new_shift = self.shifts[frame_id]
            expected_head = translated(old_head, new_shift["x"] - old_shift["x"], new_shift["y"] - old_shift["y"])
            self.check(new_head == expected_head, "registration-head-transform-mismatch",
                       "Head protection must translate by the exact source89 head displacement", frameId=frame_id)
        for index, reg in enumerate(self.registrations):
            self.check(reg["sourceSha256"] == self.sources[index].sha256, "registration-source-binding-mismatch",
                       "Registration must bind its own source ZIP", edition=("before", "after")[index])

    def appearance(self):
        before, after = [base.Archive(directory / "male.appearance.zip") for directory in (self.before, self.after)]
        expected = copy.deepcopy(before.manifest)
        poses = base.frame_map(expected["poses"], "frameId", "appearance poses")
        for frame_id in NEW_IDS:
            shift = self.shifts[frame_id]
            pose = translated(poses[89], shift["x"], shift["y"])
            pose.update({"frameId": frame_id, "sourceFrame": frame_id})
            expected["poses"][next(index for index, row in enumerate(expected["poses"]) if row["frameId"] == frame_id)] = pose
        layer_count = 0
        for style in expected["styles"]:
            for layer in style["layers"]:
                layer_count += 1
                frames = base.frame_map(layer["frames"], "frameId", f"appearance {style['id']}/{layer['role']}")
                for frame_id in NEW_IDS:
                    shift = self.shifts[frame_id]
                    row = copy.deepcopy(frames[89])
                    row["frameId"] = frame_id
                    base.require(row["mode"] in ("paint", "source"), "Unknown appearance frame mode")
                    if row["mode"] == "paint":
                        row["offset"]["x"] += shift["x"]
                        row["offset"]["y"] += shift["y"]
                    layer["frames"][next(index for index, item in enumerate(layer["frames"]) if item["frameId"] == frame_id)] = row
        paths = base.changed_paths(base.omit(expected, base.BINDINGS | {"provenance"}),
                                   base.omit(after.manifest, base.BINDINGS | {"provenance"}))
        self.check(not paths, "appearance-transform-or-crop-changed",
                   "Appearance changes may only follow declared107/108 head transforms; all crops and old geometry stay exact", changedPaths=paths)
        self.check(isinstance(after.manifest.get("provenance"), str), "appearance-provenance-invalid", "Appearance provenance must remain explicit text")
        inventory = set(before.files) - {"manifest.json"}
        self.check(inventory == set(after.files) - {"manifest.json"}, "appearance-entry-inventory-changed", "All appearance entry names must remain exact")
        changed_entries = [name for name in sorted(inventory) if before.files[name] != after.files.get(name)]
        self.check(not changed_entries, "appearance-image-changed", "All appearance PNG/other payload bytes must remain exact", files=changed_entries)
        self.report["appearance"] = {"beforeSha256": before.sha256, "afterSha256": after.sha256,
                                     "changedUnexpectedPaths": paths, "changedPayloads": changed_entries,
                                     "checkedLayers": layer_count, "allowedPoseFrames": list(NEW_IDS)}
        self.bindings(before.manifest, 0, "appearance")
        self.bindings(after.manifest, 1, "appearance")

    def catalog(self):
        super().catalog()
        self.check([row.get("edition") for row in self.catalogs] == [3, 4], "recovery-edition-lineage-invalid",
                   "This artwork audit requires exact V3→V4 lineage")
        self.check(self.spec["previousEdition"] == self.catalogs[1].get("previousEdition"),
                   "input-lineage-mismatch", "V4 input must identify the same previous edition as built assets")
        for label, catalog, source in zip(("before", "after"), self.catalogs, self.sources):
            metadata = source.recipe["sourceMetadata"]["landingCandidate"]
            self.check(catalog.get("visualAcceptance") == metadata.get("visualAcceptance") == "pending"
                       and catalog.get("status") == metadata.get("status") == "generated-review-candidate",
                       "candidate-review-status-invalid", "Both editions remain explicit experimental candidates pending visual acceptance", edition=label)
        self.check(self.spec.get("provenance", {}).get("visualAcceptance") == "pending",
                   "input-visual-status-invalid", "Integrity validation must not imply authored artwork was visually accepted")

    def runtime_profile(self):
        rows = json.loads(self.profiles_path.read_bytes())
        selected = []
        for source in self.sources:
            matches = [row for row in rows if row["profile"]["sourceSha256"] == source.sha256]
            base.require(len(matches) == 1, "Exactly one runtime profile must bind each compared source")
            selected.append(matches[0])
        before, after = selected
        self.check(before["sourceActions"] == after["sourceActions"], "runtime-source-actions-changed", "Source action contract must remain exact")
        self.check(before["profile"]["actions"] == after["profile"]["actions"], "runtime-basic-actions-changed", "All basic gameplay actions must remain unchanged")
        jump = after["profile"]["actions"]["jump"]
        self.check(jump == {"frames": list(range(63, 91)), "fps": 24, "loop": False},
                   "runtime-single-jump-changed", "Basic jump must remain63..90,24FPS,non-looping")
        self.report["runtimeProfile"] = {"status": "checked", "path": str(self.profiles_path),
                                         "beforeId": before["profile"]["id"], "afterId": after["profile"]["id"],
                                         "basicActionsExact": before["profile"]["actions"] == after["profile"]["actions"],
                                         "jump": jump}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--profiles", type=Path)
    args = parser.parse_args()
    before, after, input_path, report = (path.resolve() for path in (args.before, args.after, args.input, args.report))
    base.require(not report.is_relative_to(before) and not report.is_relative_to(after), "Report must be outside both read-only asset directories")
    base.require(report != input_path and report != (args.profiles.resolve() if args.profiles else None), "Report must not overwrite an input")
    audit = RecoveryAudit(before, after, input_path, args.profiles.resolve() if args.profiles else None)
    audit.part("recovery", audit.run)
    base.require(report not in referenced_input_files(getattr(audit, "spec", None), input_path.parent),
                 "Report must not overwrite referenced artwork, masks, garment inputs or provenance files")
    audit.report["passed"] = not audit.errors
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(audit.report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": audit.report["passed"], "errors": len(audit.errors), "report": str(report)}))
    return 0 if audit.report["passed"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as failure:
        print(str(failure), file=sys.stderr)
        sys.exit(2)
