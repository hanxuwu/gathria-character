#!/usr/bin/env python3
"""Append two authored landing poses to an isolated, reusable male wardrobe.

Input paths are relative to --input. Existing source/garment/appearance PNG files
are copied byte for byte. Only supplied new artwork is cropped/atlased; this
builder does not generate, resize, warp, or repaint character pixels.

Use --source-only as soon as frames and registration are authored. The final
source and registration bytes do not depend on garment input availability.
The companion TypeScript reader validates the resulting production contracts.

Later candidate editions set input.edition and input.previousEdition (the prior
edition number and exact source/registration SHA-256). Logical character and
garment IDs stay stable; archive hashes distinguish the immutable editions.
Omitting these fields preserves the original edition's exact output bytes.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
CHARACTER = "kling-male-side-landing-candidate-v1"
NATIVE_SIZE = (512, 768)
OLD_IDS = list(range(107))
NEW_IDS = [107, 108]
ALL_IDS = OLD_IDS + NEW_IDS
SHIFTS = {107: (-9, -7), 108: (-18, -14)}
BASE_SOURCE = ROOT / "docs/kling-side-workspace/assets/male.source.zip"
BASE_REGISTRATION = ROOT / "artwork/kling-side-expansion/templates/male.registration.json"
BASE_APPEARANCE = ROOT / "docs/matched-hair/assets/male-side.appearance.zip"
DEFAULT_GARMENTS = {
    "dailyTop": ROOT / "docs/paired-polish/assets/male/polished-male-side-sea-top-v1.garment.zip",
    "dailyBottom": ROOT / "docs/dual-tailored/assets/male/dual-tailored-male-side-sea-bottom-v1.garment.zip",
}
GARMENTS = {
    "dailyTop": ("male-daily-top.garment.zip", "landing-male-daily-top-v1", "top", "落地候选 · 日常衬衫"),
    "dailyBottom": ("male-daily-bottom.garment.zip", "landing-male-daily-bottom-v1", "bottom", "落地候选 · 日常长裤"),
    "weddingTop": ("male-wedding-top.garment.zip", "landing-male-wedding-top-v1", "top", "落地候选 · 婚礼上装"),
    "weddingBottom": ("male-wedding-bottom.garment.zip", "landing-male-wedding-bottom-v1", "bottom", "落地候选 · 婚礼长裤"),
}
ANCHORS = (
    "neck nearShoulder farShoulder waistLeft waistRight nearHip farHip "
    "nearElbow farElbow nearWrist farWrist nearKnee farKnee nearAnkle farAnkle nearToe farToe"
).split()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def edition_metadata(spec: dict) -> dict:
    if "edition" not in spec:
        assert "previousEdition" not in spec, "A previous edition requires an explicit new edition number"
        return {}
    edition = spec["edition"]
    assert type(edition) is int and edition >= 2, "Explicit edition numbers begin at 2; legacy inputs are edition 1"
    previous = spec.get("previousEdition")
    assert isinstance(previous, dict) and set(previous) == {"edition", "sourceSha256", "registrationSha256"}
    assert type(previous["edition"]) is int and previous["edition"] == edition - 1
    for key in ("sourceSha256", "registrationSha256"):
        assert isinstance(previous[key], str) and re.fullmatch(r"[0-9a-f]{64}", previous[key]), f"Invalid previous edition {key}"
    return {"edition": edition, "previousEdition": copy.deepcopy(previous)}


def head_translations(spec: dict) -> dict[int, tuple[int, int]]:
    """Use one explicit integer transform for copied heads and appearance layers.

    Missing per-frame fields reproduce the published V1–V3 asset bytes. A new
    transform is an authored V4+ choice, not an implicit migration of old art.
    The pixel-copy verifier separately rejects any visible head clipping.
    """
    rows = {frame["frameId"]: frame for frame in spec["frames"]}
    assert set(rows) == set(NEW_IDS) and len(spec["frames"]) == len(NEW_IDS)
    result = {}
    for frame_id in NEW_IDS:
        frame = rows[frame_id]
        if "headTranslation" not in frame:
            result[frame_id] = SHIFTS[frame_id]
            continue
        value = frame["headTranslation"]
        assert isinstance(value, dict) and set(value) == {"x", "y"}, f"Frame {frame_id}: headTranslation requires x and y only"
        assert all(type(value[key]) is int and -128 <= value[key] <= 128 for key in ("x", "y")), (
            f"Frame {frame_id}: headTranslation must use reviewed integer offsets within ±128 native pixels"
        )
        result[frame_id] = (value["x"], value["y"])
        edition = spec.get("edition", 1)
        assert result[frame_id] == SHIFTS[frame_id] or (type(edition) is int and edition >= 4), (
            "Changed head placement requires a separately bound V4+ edition"
        )
    return result


def encoded(value, *, compact=False) -> bytes:
    options = {"separators": (",", ":")} if compact else {"indent": 2}
    return (json.dumps(value, ensure_ascii=False, **options) + "\n").encode()


def archive(files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as container:
        for name, data in files.items():
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_STORED if name.endswith((".png", ".zip")) else zipfile.ZIP_DEFLATED
            container.writestr(info, data, compresslevel=9)
    return output.getvalue()


def opened(path: Path) -> tuple[bytes, dict[str, bytes], dict]:
    data = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as container:
        assert len(container.namelist()) == len(set(container.namelist())), f"Duplicate ZIP entries: {path}"
        assert container.testzip() is None, f"Corrupt ZIP: {path}"
        files = {name: container.read(name) for name in container.namelist()}
    return data, files, json.loads(files["manifest.json"])


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9)
    return output.getvalue()


def png(path: Path, *, native=False) -> tuple[bytes, Image.Image]:
    data = path.read_bytes()
    image = Image.open(io.BytesIO(data))
    assert image.format == "PNG" and image.mode == "RGBA", f"Supply RGBA PNG: {path}"
    assert not getattr(image, "is_animated", False), f"Supply static PNG: {path}"
    image.load()
    if native:
        assert image.size == NATIVE_SIZE, f"Expected native 512x768: {path}"
        assert image.getchannel("A").getextrema()[0] == 0, f"Missing transparent background: {path}"
    assert image.getchannel("A").getbbox(), f"Empty PNG: {path}"
    return data, image


def native_point(point: dict) -> None:
    assert all(isinstance(point[key], (int, float)) for key in ("x", "y"))
    assert 0 <= point["x"] <= NATIVE_SIZE[0] and 0 <= point["y"] <= NATIVE_SIZE[1]


def registered_frame(value: dict, frame_id: int) -> dict:
    frame = copy.deepcopy(value)
    assert frame.get("frameId", frame_id) == frame_id
    frame["frameId"] = frame_id
    frame["sourceFrame"] = frame_id
    assert set(frame) == {"frameId", "sourceFrame", "points", "protected"}
    assert set(frame["points"]) == set(ANCHORS), f"Frame {frame_id}: provide all authoring anchors"
    for point in frame["points"].values():
        native_point(point)
        assert point["visibility"] in ("visible", "occluded")
    labels = [region["label"] for region in frame["protected"]]
    assert "head" in labels and len(labels) == len(set(labels))
    assert set(labels) <= {"head", "nearHand", "farHand"}
    for region in frame["protected"]:
        assert 3 <= len(region["polygon"]) <= 64
        for point in region["polygon"]:
            native_point(point)
    return frame


def write(path: Path, data: bytes, check: bool) -> None:
    if check:
        assert path.read_bytes() == data, f"Reproduction mismatch: {path}"
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def translate_geometry(value, dx: int, dy: int):
    if isinstance(value, list):
        return [translate_geometry(item, dx, dy) for item in value]
    if isinstance(value, dict):
        output = {key: translate_geometry(item, dx, dy) for key, item in value.items()}
        if "x" in output and "y" in output:
            output["x"] += dx
            output["y"] += dy
        return output
    return value


def verify_head_copy(spec: dict, relative, files: dict[str, bytes], manifest: dict, inputs: dict, fixture: bool):
    if "headCopy" not in spec:
        assert fixture, "Supply headCopy.mask: the source89-coordinate binary head assembly mask"
        return None, {"status": "not-checked-schema-fixture"}
    mask_bytes = relative(spec["headCopy"]["mask"]).read_bytes()
    mask_image = Image.open(io.BytesIO(mask_bytes))
    assert mask_image.format == "PNG" and mask_image.mode in ("RGBA", "L")
    assert mask_image.size == NATIVE_SIZE
    mask = mask_image.getchannel("A") if mask_image.mode == "RGBA" else mask_image
    mask_pixels = mask.tobytes()
    assert set(mask_pixels) <= {0, 255}, "Head assembly mask must be binary"
    frame = next(frame for frame in manifest["frames"] if frame["id"] == 89)
    page = [manifest["spritesheet"], *manifest["additionalSheets"]][frame["page"]]
    decoded = Image.open(io.BytesIO(files[page["file"]])).convert("RGBA")
    source = decoded.crop((frame["x"], frame["y"], frame["x"] + 512, frame["y"] + 768)).tobytes()
    positions = [position for position, owned in enumerate(mask_pixels) if owned and source[position * 4 + 3]]
    assert len(positions) >= 10000, "Head assembly mask must cover the visible source head, not a token sample"
    frames = []
    shifts = head_translations(spec)
    for frame_id in NEW_IDS:
        dx, dy = shifts[frame_id]
        target = inputs[frame_id][1].tobytes()
        for position in positions:
            x, y = position % 512, position // 512
            assert 0 <= x + dx < 512 and 0 <= y + dy < 768, "Copied head is cropped outside candidate canvas"
            destination = ((y + dy) * 512 + x + dx) * 4
            assert source[position * 4:position * 4 + 4] == target[destination:destination + 4], (
                f"Frame {frame_id}: source89 head RGBA differs at source pixel ({x},{y})"
            )
        frames.append({"frameId": frame_id, "translation": {"x": dx, "y": dy},
                       "exactVisibleHeadPixels": len(positions)})
    return mask_bytes, {"status": "exact-visible-rgba-verified", "sourceFrameId": 89,
                        "sourceFrameRgbaSha256": sha(source), "sourceCoordinateMaskSha256": sha(mask_bytes),
                        "maskMeaning": "Authored source89 head assembly mask; visible masked pixels independently compared without resampling",
                        "frames": frames}


def source_assets(spec: dict, relative, fixture: bool):
    edition = edition_metadata(spec)
    shifts = head_translations(spec)
    base_bytes, base_files, before = opened(BASE_SOURCE)
    base_recipe = json.loads(base_files["character.json"])
    old_registration_bytes = BASE_REGISTRATION.read_bytes()
    old_registration = json.loads(old_registration_bytes)
    assert before["schemaVersion"] == 3 and len(before["additionalSheets"]) == 2
    assert sorted(frame["id"] for frame in before["frames"]) == OLD_IDS
    assert before["spritesheet"]["frameWidth"] == 512 and before["spritesheet"]["frameHeight"] == 768
    assert before["anchor"] == {"x": 256, "y": 710, "units": "pixels", "origin": "top-left"}
    assert old_registration["sourceSha256"] == sha(base_bytes)
    assert sorted(frame["frameId"] for frame in old_registration["frames"]) == OLD_IDS
    new_specs = {frame["frameId"]: frame for frame in spec["frames"]}
    assert sorted(new_specs) == NEW_IDS and len(spec["frames"]) == 2
    inputs = {frame_id: png(relative(new_specs[frame_id]["image"]), native=True) for frame_id in NEW_IDS}
    head_mask, head_copy = verify_head_copy(spec, relative, base_files, before, inputs, fixture)
    provenance = copy.deepcopy(spec["provenance"])
    assert provenance.get("visualAcceptance") == "pending", "Build never declares visual acceptance"
    if not fixture:
        assert provenance.get("origin") in ("generated-art-candidate", "generated-and-painted-art-candidate")
    assert len(encoded(provenance)) <= 32 * 1024
    status = "schema-fixture-only" if fixture else "generated-review-candidate"
    original_derivation = {row["frameId"]: row for row in base_recipe["derivation"]["frames"]}
    source_index = {
        "format": "gathria-landing-candidate-source-index", "version": 1,
        "status": status,
        **edition,
        "indexMeaning": "Archive collection entries, not video frame numbers; timeSeconds=0 means no single source timeline.",
        "entries": [
            {"index": frame_id, "kind": "unchanged-native-source-frame", "archive": "original.character.zip",
             "frameId": frame_id, "originalDerivation": original_derivation[frame_id]}
            for frame_id in OLD_IDS
        ] + [
            {"index": frame_id, "kind": "schema-fixture" if fixture else "generated-authored-pose",
             "file": f"{frame_id}.png", "sha256": sha(inputs[frame_id][0]), "notAnOriginalVideoFrame": True}
            for frame_id in NEW_IDS
        ],
    }
    reference_name = "male-landing-reference.zip"
    reference = archive({
        "original.character.zip": base_bytes,
        **{f"{frame_id}.png": inputs[frame_id][0] for frame_id in NEW_IDS},
        "source-index.json": encoded(source_index),
        "art-provenance.json": encoded(provenance),
        "head-copy-verification.json": encoded(head_copy),
        **({"source89-head-copy-mask.png": head_mask} if head_mask is not None else {}),
    })
    sheet = Image.new("RGBA", (1024, 768))
    for column, frame_id in enumerate(NEW_IDS):
        sheet.paste(inputs[frame_id][1], (column * 512, 0))
    manifest = copy.deepcopy(before)
    manifest["name"] = "Kling male · landing candidate · original / daily / wedding"
    manifest["generator"] = "gathria-landing-production-assets-v1"
    manifest["additionalSheets"].append({
        "file": "spritesheet-3.png", "width": 1024, "height": 768,
        "frameWidth": 512, "frameHeight": 768, "columns": 2, "rows": 1,
    })
    manifest["frames"].extend({
        "id": frame_id, "page": 3, "x": column * 512, "y": 0, "width": 512, "height": 768,
    } for column, frame_id in enumerate(NEW_IDS))
    note = (
        ("SCHEMA FIXTURE ONLY. No artwork acceptance. " if fixture else "EXPERIMENTAL GENERATED ART CANDIDATE; visual acceptance pending. ")
        + "Original native frames 0..106 and all three PNG pages are preserved byte for byte. "
        "Frames 107/108 are supplied authored landing proposals, not original video extractions. "
        "Source frame indices are archive collection entries in the accompanying reference ZIP; "
        "timeSeconds=0 does not claim a video timestamp. Original video derivations remain in that ZIP. "
        "Standalone action clips, anchor and native facing are unchanged. The new poses are available "
        "only to an explicitly selected experimental transition profile. No production default or skeleton is replaced."
    )
    recipe = {
        "format": "gathria-baked-character", "schemaVersion": 1,
        "name": manifest["name"], "characterId": CHARACTER,
        "source": {"kind": "unified-archive", "name": reference_name, "sha256": sha(reference)},
        "provenance": note,
        "derivation": {
            "method": "Append two native transparent authored PNGs without modifying the three source atlases. "
            "sourceFrame is a source-index.json collection index; original derivations are retained in the reference ZIP.",
            "frames": [{"frameId": frame_id, "sourceFrame": frame_id, "timeSeconds": 0} for frame_id in ALL_IDS],
        },
        "sourceMetadata": {"landingCandidate": {
            "format": "gathria-landing-production-candidate", "version": 1, "status": status,
            **edition,
            "visualAcceptance": "pending", "baseSourceSha256": sha(base_bytes),
            "baseRegistrationSha256": sha(old_registration_bytes),
            "originalFrameIds": OLD_IDS, "generatedFrameIds": NEW_IDS,
            "sourceIndexMeaning": "Archive collection entry; never interpret generated IDs as video frames",
            "sourceIndexFile": f"{reference_name}/source-index.json",
            "headSourceFrameId": 89,
            "headTranslations": {str(frame_id): {"x": shifts[frame_id][0], "y": shifts[frame_id][1]} for frame_id in NEW_IDS},
            "headCopyVerification": head_copy,
            "artProvenance": provenance,
            "originalAtlasSha256": {sheet["file"]: sha(base_files[sheet["file"]])
                                    for sheet in [before["spritesheet"], *before["additionalSheets"]]},
        }},
    }
    files = {sheet["file"]: base_files[sheet["file"]] for sheet in [before["spritesheet"], *before["additionalSheets"]]}
    files.update({
        "spritesheet-3.png": png_bytes(sheet), "manifest.json": encoded(manifest),
        "character.json": encoded(recipe), "PROVENANCE.txt": (note + "\n").encode(),
        "INTEGRATION.md": (
            "# Optional male landing candidate\n\n" + note + "\n\n"
            "Use all four declared PNG pages and each frame's original native rectangle. Render right natively; "
            "left mirrors around anchor (256,710). Never rescale or interpolate source poses. "
            "Raw source actions preserve the original clips. Experimental gameplay routes belong to the separate "
            "exact source-bound profile; no gameplayMotion metadata is embedded in this raw source. "
            "Reusable garments/head layers and editable selection are stored in the Wardrobe project.\n"
        ).encode(),
    })
    source = archive(files)
    assert len(source) <= 64 * 1024 * 1024
    registration = copy.deepcopy(old_registration)
    registration["sourceSha256"] = sha(source)
    registration["characterId"] = CHARACTER
    for frame in registration["frames"]:
        frame["sourceFrame"] = frame["frameId"]
    registration["frames"].extend(registered_frame(new_specs[frame_id]["registration"], frame_id) for frame_id in NEW_IDS)
    registration_bytes = encoded(registration, compact=True)
    assert len(registration_bytes) <= 1024 * 1024
    return source, registration_bytes, reference, manifest, old_registration, head_copy


def extend_garment(key: str, value: dict, relative, source_hash: str, registration_hash: str, old_registration: dict):
    path = relative(value["base"]) if "base" in value else DEFAULT_GARMENTS.get(key)
    assert path, f"Provide {key}.base for the newly authored 107-frame wedding bank"
    base_bytes, files, before = opened(path)
    assert before["sourceSha256"] == old_registration["sourceSha256"]
    assert before["registrationSha256"] == sha(BASE_REGISTRATION.read_bytes())
    assert before["characterId"] == old_registration["characterId"]
    assert sorted(frame["frameId"] for frame in before["frames"]) == OLD_IDS
    assert (before["frameWidth"], before["frameHeight"]) == NATIVE_SIZE
    filename, item_id, slot, name = GARMENTS[key]
    assert before["slot"] == slot and before["version"] in (1, 2), "New binding needs its own explicit V3 permission profile"
    assert len(before["pages"]) < 4, "Appending a page must fit the existing garment page budget"
    specs = {frame["frameId"]: frame for frame in value["frames"]}
    assert sorted(specs) == NEW_IDS and len(value["frames"]) == 2
    crops = []
    audits = []
    for frame_id in NEW_IDS:
        item = specs[frame_id]
        patch_bytes, patch = png(relative(item["patch"]))
        mask_bytes, mask = png(relative(item["ownership"]))
        assert patch.size == mask.size
        offset = item.get("offset", {"x": 0, "y": 0})
        assert all(type(offset[key]) is int and offset[key] >= 0 for key in ("x", "y"))
        assert offset["x"] + patch.width <= 512 and offset["y"] + patch.height <= 768
        alpha = mask.getchannel("A")
        assert set(alpha.tobytes()) <= {0, 255}, f"{key}/{frame_id}: ownership must be binary alpha"
        assert not ImageChops.subtract(patch.getchannel("A"), alpha).getbbox(), f"{key}/{frame_id}: patch outside ownership"
        bounds = alpha.getbbox()
        assert bounds, f"{key}/{frame_id}: empty ownership"
        crops.append((frame_id, patch.crop(bounds), mask.crop(bounds),
                      {"x": offset["x"] + bounds[0], "y": offset["y"] + bounds[1]}))
        audits.append({"frameId": frame_id, "patchSha256": sha(patch_bytes), "ownershipSha256": sha(mask_bytes)})
    width = sum(patch.width for _, patch, _, _ in crops)
    height = max(patch.height for _, patch, _, _ in crops)
    patches = Image.new("RGBA", (width, height))
    ownership = Image.new("RGBA", (width, height))
    manifest = copy.deepcopy(before)
    page = len(manifest["pages"])
    patch_file, mask_file = f"patches-{page}.png", f"ownership-{page}.png"
    manifest["pages"].append({"file": patch_file, "maskFile": mask_file, "width": width, "height": height})
    x = 0
    for frame_id, patch, mask, offset in crops:
        patches.paste(patch, (x, 0))
        ownership.paste(mask, (x, 0))
        manifest["frames"].append({"frameId": frame_id, "page": page,
                                   "rect": {"x": x, "y": 0, "width": patch.width, "height": patch.height}, "offset": offset})
        x += patch.width
    manifest.update({"id": item_id, "name": name, "sourceSha256": source_hash,
                     "registrationSha256": registration_hash, "characterId": CHARACTER})
    manifest["provenance"] += (
        "\nExperimental landing candidate binding. Existing 107 per-frame crop rectangles, offsets, "
        "PNG artwork and ownership pages are copied exactly from base SHA256 " + sha(base_bytes) + ". "
        "Supplied authored garment patches and binary ownership for107/108 occupy one appended page. "
        "Body/head pixels are not garment assets. Visual acceptance remains pending."
    )
    output = dict(files)
    output.update({"manifest.json": encoded(manifest), patch_file: png_bytes(patches), mask_file: png_bytes(ownership)})
    assert manifest["frames"][:107] == before["frames"]
    assert all(output[name] == data for name, data in files.items() if name != "manifest.json")
    data = archive(output)
    return filename, data, {"id": item_id, "sha256": sha(data), "baseSha256": sha(base_bytes),
                            "unchangedBasePngs": {name: sha(data) for name, data in files.items() if name.endswith(".png")},
                            "newInputs": audits, "frameCount": 109}


def extend_appearance(source_hash: str, registration_hash: str, old_registration: dict, shifts: dict[int, tuple[int, int]]):
    base_bytes, files, before = opened(BASE_APPEARANCE)
    assert before["sourceSha256"] == old_registration["sourceSha256"]
    assert before["registrationSha256"] == sha(BASE_REGISTRATION.read_bytes())
    assert sorted(pose["frameId"] for pose in before["poses"]) == OLD_IDS
    manifest = copy.deepcopy(before)
    manifest.update({"id": "landing-male-appearance-v1", "name": "Kling male · reusable landing candidate head layers",
                     "sourceSha256": source_hash, "registrationSha256": registration_hash, "characterId": CHARACTER})
    reference = next(pose for pose in before["poses"] if pose["frameId"] == 89)
    for pose in manifest["poses"]:
        pose["sourceFrame"] = pose["frameId"]
    for frame_id in NEW_IDS:
        pose = translate_geometry(reference, *shifts[frame_id])
        pose.update({"frameId": frame_id, "sourceFrame": frame_id})
        manifest["poses"].append(pose)
    for style in manifest["styles"]:
        for layer in style["layers"]:
            assert sorted(frame["frameId"] for frame in layer["frames"]) == OLD_IDS
            reference_frame = next(frame for frame in layer["frames"] if frame["frameId"] == 89)
            for frame_id in NEW_IDS:
                frame = copy.deepcopy(reference_frame)
                frame["frameId"] = frame_id
                if frame["mode"] == "paint":
                    dx, dy = shifts[frame_id]
                    frame["offset"]["x"] += dx
                    frame["offset"]["y"] += dy
                else:
                    # Preserve a donor's explicit source mode; never invent one
                    # as a missing-frame fallback for the appended poses.
                    assert frame["mode"] == "source"
                layer["frames"].append(frame)
    offset_description = "/".join(f"({shifts[frame_id][0]},{shifts[frame_id][1]})" for frame_id in NEW_IDS)
    manifest["provenance"] += (
        "\nExperimental landing candidate binding; original PNG pages and every existing style/layer crop are byte-exact. "
        f"All styles explicitly extend to107/108 using source89's existing crops with integer offsets{offset_description}, "
        "matching the exact copied source89 head in the authored bare poses. Head anchors, bounds, foreground and face polygons "
        "translate by the same offsets. No head resampling, newly painted face or missing-style fallback. "
        "Source-frame fields now denote archive collection IDs; original video maps remain in the reference source ZIP."
    )
    output = dict(files)
    output["manifest.json"] = encoded(manifest)
    assert all(output[name] == data for name, data in files.items() if name != "manifest.json")
    for old_style, new_style in zip(before["styles"], manifest["styles"]):
        for old_layer, new_layer in zip(old_style["layers"], new_style["layers"]):
            assert old_layer["frames"] == new_layer["frames"][:107]
    data = archive(output)
    return data, {"sha256": sha(data), "baseSha256": sha(base_bytes),
                  "styles": [style["id"] for style in manifest["styles"]], "frameCount": 109,
                  "unchangedBasePngs": {name: sha(data) for name, data in files.items() if name.endswith(".png")}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "docs/kling-landing-production/assets")
    parser.add_argument("--source-only", action="store_true")
    parser.add_argument("--check", action="store_true", help="Rebuild in memory and compare deterministic output bytes")
    parser.add_argument("--fixture-only", action="store_true", help="Mark technical schema inputs explicitly; never accepted artwork")
    args = parser.parse_args()
    spec = json.loads(args.input.read_bytes())
    edition = edition_metadata(spec)
    relative = lambda path: (args.input.resolve().parent / path).resolve()
    source, registration, reference, manifest, old_registration, head_copy = source_assets(spec, relative, args.fixture_only)
    source_hash, registration_hash = sha(source), sha(registration)
    output = {"male.source.zip": source, "male.registration.json": registration, "male-landing-reference.zip": reference}
    report = {"format": "gathria-landing-production-build", "version": 1,
              **edition,
              "fixtureOnly": args.fixture_only, "visualAcceptance": "pending", "sourceSha256": source_hash,
              "registrationSha256": registration_hash, "sourceReferenceSha256": sha(reference),
              "sourceFrames": 109, "originalFrames": 107, "originalSourcePagesByteExact": True,
              "sourceActionsUnchanged": True, "rawSourceDeclaresGameplayProfile": False,
              "headCopyVerification": head_copy, "garments": {}}
    if not args.source_only:
        assert set(spec["garments"]) == set(GARMENTS), "Supply all four garment extensions"
        for key in GARMENTS:
            filename, data, audit = extend_garment(key, spec["garments"][key], relative, source_hash, registration_hash, old_registration)
            output[filename] = data
            report["garments"][key] = audit
    appearance, appearance_audit = extend_appearance(source_hash, registration_hash, old_registration, head_translations(spec))
    output["male.appearance.zip"] = appearance
    report["appearance"] = appearance_audit
    selection = lambda top=None, bottom=None: {"top": top, "bottom": bottom, "shoes": None, "fullBody": None}
    catalog = {"format": "gathria-landing-production-catalog", "version": 1,
               **edition,
               "status": "schema-fixture-only" if args.fixture_only else "source-ready" if args.source_only else "generated-review-candidate",
               "visualAcceptance": "pending", "characterId": CHARACTER,
               "sourceSha256": source_hash, "registrationSha256": registration_hash,
               "frameCount": len(manifest["frames"]), "garmentIds": {key: value[1] for key, value in GARMENTS.items()},
               "presets": {"original": selection(), "daily": selection(GARMENTS["dailyTop"][1], GARMENTS["dailyBottom"][1]),
                           "wedding": selection(GARMENTS["weddingTop"][1], GARMENTS["weddingBottom"][1])}}
    output["catalog.json"] = encoded(catalog)
    report["outputs"] = {name: {"bytes": len(data), "sha256": sha(data)} for name, data in output.items()}
    output["build-receipt.json"] = encoded(report)
    for name, data in output.items():
        write(args.out / name, data, args.check)
    print(json.dumps({"status": catalog["status"], "sourceSha256": source_hash,
                      "registrationSha256": registration_hash, "files": len(output), "checked": args.check}))


if __name__ == "__main__":
    main()
