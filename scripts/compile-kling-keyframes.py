"""Build source-pixel-exact, separately named loop-study packs.

Only integer crops/copies of the approved exported frames are used. Repeated
frame IDs express pose holds at 24 ticks/s; no pixels or in-between poses are
generated. Source packs and their original one-shot jump remain untouched.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import io
import json
import math
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "artwork/kling-keyframes/selection.json"
ACTIONS = ["idle", "walk", "run", "jump", "celebrate"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def source_frames(path):
    data = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        recipe = json.loads(archive.read("character.json"))
        sheets = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        images = []
        for sheet in sheets:
            image = Image.open(io.BytesIO(archive.read(sheet["file"])))
            image.load()
            assert image.mode == "RGBA"
            assert image.size == (sheet["width"], sheet["height"])
            images.append(image)
        frames = {}
        for frame in manifest["frames"]:
            x, y, w, h = (frame[key] for key in ["x", "y", "width", "height"])
            frames[frame["id"]] = images[frame.get("page", 0)].crop((x, y, x + w, y + h))
        for image in images:
            image.close()
    return data, manifest, recipe, frames


def compile_character(identity, selection, output):
    path = ROOT / selection["sourcePack"]
    source, old, recipe, frames = source_frames(path)
    assert sha(source) == selection["sourcePackSha256"], "Source archive changed"
    assert set(selection["actions"]) == set(ACTIONS)
    animations = {}
    unique = set()
    action_report = {}
    for action in ACTIONS:
        item = selection["actions"][action]
        assert item["fps"] == 24 and item["loop"] is True
        allowed = set(old["animations"][action]["frames"])
        keys = item["keys"]
        assert keys and len({key["frameId"] for key in keys}) == len(keys)
        assert [key["frameId"] for key in keys] == sorted(key["frameId"] for key in keys), "Forward source order required"
        sequence = []
        for key in keys:
            assert key["frameId"] in allowed
            assert type(key["ticks"]) is int and 1 <= key["ticks"] <= 24
            assert key["phase"] and key["sourceFrame"] >= 0
            source_map = next(row for row in recipe["derivation"]["frames"] if row["frameId"] == key["frameId"])
            assert source_map["sourceFrame"] == key["sourceFrame"]
            sequence.extend([key["frameId"]] * key["ticks"])
        assert len(sequence) == item["ticks"] <= 1024
        if action != "jump":
            assert len(sequence) == len(old["animations"][action]["frames"]), "Retain non-jump cycle duration"
        unique.update(sequence)
        animations[action] = {"frames": sequence, "fps": 24, "loop": True}
        action_report[action] = {
            "originalFrames": len(old["animations"][action]["frames"]),
            "uniqueKeyframes": len(keys), "playbackTicks": len(sequence),
            "durationMs": len(sequence) * 1000 / 24,
            "sourceFrameIds": [key["frameId"] for key in keys],
            "holds": [key["ticks"] for key in keys],
            "loop": True,
        }
    ids = sorted(unique)
    assert len(ids) <= 77
    w, h = old["spritesheet"]["frameWidth"], old["spritesheet"]["frameHeight"]
    assert (w, h) == (704, 1056)
    # A near-square atlas with no more than 11 columns or 7 rows.
    cols = min(11, max(math.ceil(len(ids) / 7), math.ceil(math.sqrt(len(ids) * h / w))))
    rows = math.ceil(len(ids) / cols)
    atlas = Image.new("RGBA", (cols * w, rows * h))
    definitions = []
    fidelity = []
    for index, frame_id in enumerate(ids):
        x, y = index % cols * w, index // cols * h
        image = frames[frame_id]
        atlas.paste(image, (x, y))  # No alpha compositing: copy all four channels.
        definitions.append({"id": frame_id, "x": x, "y": y, "width": w, "height": h})
    png_buffer = io.BytesIO()
    atlas.save(png_buffer, format="PNG", compress_level=9)
    png = png_buffer.getvalue()
    decoded = Image.open(io.BytesIO(png))
    decoded.load()
    for definition in definitions:
        x, y = definition["x"], definition["y"]
        actual = decoded.crop((x, y, x + w, y + h))
        expected = frames[definition["id"]]
        assert actual.tobytes() == expected.tobytes(), "Repacked pixels changed"
        alpha = np.asarray(actual)[:, :, 3]
        assert np.any(alpha == 0) and np.any(alpha == 255)
        assert not np.any(alpha[:, 0]) and not np.any(alpha[:, -1])
        assert not np.any(alpha[0]) and not np.any(alpha[-1])
        fidelity.append({"frameId": definition["id"], "rgbaSha256": sha(actual.tobytes()), "exactSourceRgba": True})
    name = f"Kling {identity} - keyframe loop study"
    manifest = {
        "schemaVersion": 2, "format": "gathria-character-pack", "name": name,
        "generator": "gathria-source-keyframes-v1",
        "spritesheet": {"file": "spritesheet.png", "width": atlas.width, "height": atlas.height,
                        "frameWidth": w, "frameHeight": h, "columns": cols, "rows": rows},
        "frames": definitions, "animations": animations,
        **{key: copy.deepcopy(old[key]) for key in ["anchor", "facing", "scale", "capabilities", "configuration"]},
    }
    assert manifest["anchor"] == old["anchor"]
    note = (
        "Separate keyframe LOOP STUDY, not an approved replacement for the original clips. "
        "Only existing source frames were selected in forward order and held on a 24 Hz timeline. "
        "All selected 704x1056 RGBA frames and the anchor are exact; the atlas is losslessly repacked, "
        "so atlas PNG file bytes and rectangles differ. No resizing, interpolation, per-frame recentering, "
        "redraw, wardrobe or skeletal generation. All five study actions repeat. Jump specifically trims "
        "the original one-shot into repeated hops: landing crouch leads to the next takeoff; it does not "
        "include the original final upright recovery. Original source notes below describe the original "
        "video/history; this explicit candidate selection overrides its playback range/timing only. "
        "Source motion blur, torso-angle changes and the small scalp clipping at jump source183-186 remain."
    )
    candidate_recipe = copy.deepcopy(recipe)
    candidate_recipe.update(name=name, characterId=f"kling-{identity}-keyframes-v1")
    candidate_recipe["provenance"] = note + "\n\nOriginal source provenance:\n" + recipe["provenance"]
    candidate_recipe["derivation"] = {
        "method": note + "\n\nOriginal extraction method:\n" + recipe["derivation"]["method"],
        "frames": [row for row in recipe["derivation"]["frames"] if row["frameId"] in unique],
    }
    candidate_recipe.setdefault("sourceMetadata", {})["keyframeStudy"] = {
        "format": "gathria-kling-keyframe-study", "version": 1, "status": "candidate",
        "characterId": identity,
        "sourcePackSha256": sha(source), "sourcePack": selection["sourcePack"],
        "sourceAtlasFrameIdsPreserved": True, "exactRgbaCopies": True,
        "originalJumpStillOneShot": True, "jumpMode": "repeated-hop-crouch-to-crouch",
        "actions": selection["actions"],
    }
    integration = (
        "# Keyframe loop study\n\nCharacterPack V2; load all five archive files. "
        "Render listed rectangles without changing aspect ratio and honor the unchanged anchor. "
        "Animations list repeated frame IDs as deliberate holds at 24 FPS; do not deduplicate playback. "
        "All study actions loop, including the explicitly trimmed repeated hop. Original full jumps "
        "remain one-shot in the separate original packs. Left faces by mirror-x. Source RGBA copies "
        "remain native; no runtime drawing API or editor is needed. This pack is not a wardrobe layer kit.\n"
    )
    contents = {"spritesheet.png": png, "manifest.json": json_bytes(manifest),
                "character.json": json_bytes(candidate_recipe),
                "PROVENANCE.txt": candidate_recipe["provenance"].encode(),
                "INTEGRATION.md": integration.encode()}
    assert max(atlas.size) <= 8192 and atlas.width * atlas.height <= 64 * 1024 * 1024
    for filename, data in contents.items():
        if filename != "spritesheet.png":
            assert len(data) <= 256 * 1024
    assert len(json.dumps(candidate_recipe["sourceMetadata"], ensure_ascii=False, separators=(",", ":")).encode()) <= 64 * 1024
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for filename, data in contents.items():
            info = zipfile.ZipInfo(filename, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=6)
    data = buffer.getvalue()
    target = output / f"{identity}.character.zip"
    target.write_bytes(data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None and set(archive.namelist()) == set(contents)
    original_pixels = sum(sheet["width"] * sheet["height"] for sheet in [old["spritesheet"], *old.get("additionalSheets", [])])
    result = {"character": identity, "sourceSha256": sha(source), "packSha256": sha(data),
              "packBytes": len(data), "originalUniqueFrames": len(old["frames"]),
              "selectedUniqueFrames": len(ids), "canvas": [w, h], "anchor": manifest["anchor"],
              "atlas": list(atlas.size), "decodedBytes": atlas.width * atlas.height * 4,
              "originalDecodedBytes": original_pixels * 4, "actions": action_report, "frameFidelity": fidelity}
    for image in frames.values():
        image.close()
    atlas.close()
    decoded.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, default=PROFILE)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-keyframes/exports")
    args = parser.parse_args()
    profile = json.loads(args.profile.read_text())
    assert profile["format"] == "gathria-kling-keyframe-study" and profile["version"] == 1
    args.output.mkdir(parents=True, exist_ok=True)
    results = [compile_character(identity, profile["characters"][identity], args.output) for identity in ["male", "female"]]
    report = {"profileSha256": sha(args.profile.read_bytes()), "format": profile["format"],
              "passed": True, "packs": results}
    (args.output / "compilation-report.json").write_bytes(json_bytes(report))
    print(json.dumps([{k: row[k] for k in ["character", "selectedUniqueFrames", "packBytes", "decodedBytes"]} for row in results]))


if __name__ == "__main__":
    main()
