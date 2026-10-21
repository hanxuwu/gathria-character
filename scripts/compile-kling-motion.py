"""Compile reviewed motion candidates from existing, exact Kling frame pixels.

The original packs and 52-drawing loop studies remain immutable. Explicit pose
holds retain each source clock; full jump recovery enables a grounded exit.
Optional motionFlow metadata describes reviewed transitions for this player.
Other V2/V3 consumers still play the ordinary declared clips without it.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import io
import json
import math
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("keyframes", ROOT / "scripts/compile-kling-keyframes.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ACTIONS = base.ACTIONS


def compile_character(identity, selection, output):
    source, original, recipe, source_frames = base.source_frames(ROOT / selection["sourcePack"])
    assert base.sha(source) == selection["sourcePackSha256"]
    assert base.sha((ROOT / selection["previousPack"]).read_bytes()) == selection["previousPackSha256"]
    assert set(selection["actions"]) == set(ACTIONS)
    animations, actions = {}, {}
    for name in ACTIONS:
        chosen = selection["actions"][name]
        old = original["animations"][name]
        keys = chosen["keys"]
        ids = [key["frameId"] for key in keys]
        assert keys and len(ids) == len(set(ids))
        order = [old["frames"].index(frame_id) for frame_id in ids]
        assert order == sorted(order)
        sequence = []
        for key, source_position in zip(keys, order):
            assert type(key["ticks"]) is int and 1 <= key["ticks"] <= 24
            assert len(sequence) == source_position, "Holds must start at the original source-clock tick"
            record = next(row for row in recipe["derivation"]["frames"] if row["frameId"] == key["frameId"])
            assert record["sourceFrame"] == key["sourceFrame"]
            assert key["phase"]
            sequence.extend([key["frameId"]] * key["ticks"])
        assert len(sequence) == chosen["ticks"] == len(old["frames"])
        assert chosen["fps"] == old["fps"] == 24
        assert chosen["loop"] == old["loop"]
        if name == "jump":
            assert sequence == old["frames"] and not chosen["loop"]
        animations[name] = {"frames": sequence, "fps": 24, "loop": chosen["loop"]}
        actions[name] = {"uniqueFrames": len(ids), "ticks": len(sequence),
                         "durationMs": len(sequence) * 1000 / 24,
                         "loop": chosen["loop"], "sourceFrameIds": ids}

    routes, route_report = [], []
    for chosen in selection["routes"]:
        source_clip, target_clip = animations[chosen["from"]], animations[chosen["to"]]
        assert chosen["from"] != chosen["to"]
        exit_tick = max(i for i, value in enumerate(source_clip["frames"]) if value == chosen["exitFrameId"]) + 1
        entry = target_clip["frames"].index(chosen["entryFrameId"])
        assert exit_tick == len(source_clip["frames"]) or source_clip["frames"][exit_tick - 1] != source_clip["frames"][exit_tick]
        assert not entry or target_clip["frames"][entry - 1] != target_clip["frames"][entry]
        if chosen["from"] == "jump":
            assert exit_tick == len(source_clip["frames"])
        if chosen["to"] == "jump":
            assert entry == 0
        assert chosen["reason"]
        route = {"from": chosen["from"], "to": chosen["to"], "exit": exit_tick, "entry": entry}
        assert route not in routes
        routes.append(route)
        route_report.append({**chosen, **route})
    for first in ACTIONS:
        for second in ACTIONS:
            if first != second:
                assert any(route["from"] == first and route["to"] == second for route in routes)

    ids = sorted({frame_id for clip in animations.values() for frame_id in clip["frames"]})
    width, height = 704, 1056
    assert (original["spritesheet"]["frameWidth"], original["spritesheet"]["frameHeight"]) == (width, height)
    page_count = math.ceil(len(ids) / 77)
    page_capacity = math.ceil(len(ids) / page_count)
    definitions, sheets, pngs, fidelity = [], [], {}, []
    for page in range(page_count):
        page_ids = ids[page * page_capacity:(page + 1) * page_capacity]
        columns = min(11, max(math.ceil(len(page_ids) / 7), math.ceil(math.sqrt(len(page_ids) * height / width))))
        rows = math.ceil(len(page_ids) / columns)
        atlas = Image.new("RGBA", (width * columns, height * rows))
        page_defs = []
        for index, frame_id in enumerate(page_ids):
            x, y = (index % columns) * width, (index // columns) * height
            atlas.paste(source_frames[frame_id], (x, y))
            frame = {"id": frame_id, "x": x, "y": y, "width": width, "height": height}
            if page_count > 1:
                frame["page"] = page
            page_defs.append(frame)
        filename = "spritesheet.png" if page == 0 else f"spritesheet-{page}.png"
        stream = io.BytesIO()
        atlas.save(stream, format="PNG", compress_level=9)
        pngs[filename] = stream.getvalue()
        decoded = Image.open(io.BytesIO(pngs[filename]))
        decoded.load()
        for frame in page_defs:
            image = decoded.crop((frame["x"], frame["y"], frame["x"] + width, frame["y"] + height))
            assert image.tobytes() == source_frames[frame["id"]].tobytes()
            alpha = np.asarray(image)[:, :, 3]
            assert np.any(alpha == 0) and np.any(alpha == 255)
            assert not np.any(alpha[0]) and not np.any(alpha[-1])
            assert not np.any(alpha[:, 0]) and not np.any(alpha[:, -1])
            fidelity.append({"frameId": frame["id"], "rgbaSha256": base.sha(image.tobytes()), "exactSourceRgba": True})
        assert max(atlas.size) <= 8192 and atlas.width * atlas.height <= 64 * 1024 * 1024
        sheets.append({"file": filename, "width": atlas.width, "height": atlas.height,
                       "frameWidth": width, "frameHeight": height, "columns": columns, "rows": rows})
        definitions.extend(page_defs)
        decoded.close()
        atlas.close()
    name = f"Kling {identity} - motion flow review"
    manifest = {"schemaVersion": 3 if page_count > 1 else 2, "format": "gathria-character-pack",
                "name": name, "generator": "gathria-source-motion-v1", "spritesheet": sheets[0],
                "frames": definitions, "animations": animations,
                **{key: copy.deepcopy(original[key]) for key in ["anchor", "facing", "scale", "capabilities", "configuration"]}}
    if page_count > 1:
        manifest["additionalSheets"] = sheets[1:]
    note = (
        "Separate motion-flow review candidate compiled only from existing approved Kling frames. "
        "Selected native RGBA pixels, source IDs, anchor, source-clock positions and cycle periods are exact. "
        "Fast moving poses omitted by the earlier 52-drawing loop study are restored. Jump retains all "
        "39 original frames and plays once, including the original upright recovery. The earlier crouched-hop "
        "loop study and original packs remain separate and unchanged. Optional motionFlow metadata schedules "
        "reviewed contact/landing transitions and returns Jump to Idle in a supporting player. Other V2/V3 "
        "players play the ordinary manifest clips and hold the final jump frame. There is no interpolation, "
        "redraw, warping, recentering, new source extraction or wardrobe/skeletal generation. Original blur, "
        "pose drift, jump-apex scalp clipping and missing transition drawings remain visible. Scheduling "
        "reduces abrupt airborne exits but cannot create a perfect missing anticipation/outro."
    )
    config = copy.deepcopy(recipe)
    config.update(name=name, characterId=f"kling-{identity}-motion-v1")
    config["provenance"] = note + "\n\nOriginal source provenance:\n" + recipe["provenance"]
    config["derivation"] = {"method": note + "\n\nOriginal extraction:\n" + recipe["derivation"]["method"],
                             "frames": [row for row in recipe["derivation"]["frames"] if row["frameId"] in ids]}
    config.setdefault("sourceMetadata", {})["motionFlow"] = {
        "format": "gathria-motion-flow", "version": 1, "characterId": identity,
        "actions": animations, "routes": routes, "returnToIdle": ["jump"],
    }
    config["sourceMetadata"]["motionSelection"] = {
        "sourcePack": selection["sourcePack"], "sourceSha256": base.sha(source),
        "previousPack": selection["previousPack"], "previousPackSha256": selection["previousPackSha256"],
        "exactSourceRgba": True, "status": "review-candidate", "uniqueFrames": len(ids),
    }
    integration = (
        "# Motion flow review\n\nUse the ordinary V2/V3 manifest clips at the declared FPS. "
        "Jump plays once and includes upright recovery; all other actions loop. Repeated frame IDs "
        "are deliberate holds. Preserve the source aspect ratio and anchor, and mirror for left. "
        "Optional sourceMetadata.motionFlow contains exact clip snapshots and reviewed source-tick exit / "
        "target-tick entry routes. Apply only if all snapshots still match the loaded clips. Exits occur "
        "after the indicated tick; entries are zero-based. Latest requested action replaces pending action. "
        "Jump returns to Idle only in the supporting interactive player; an ordinary consumer holds its "
        "final frame. Pause, hiding, scrubbing, comparison and authoring are handled by the player. "
        "No source images may be blended or warped to claim a seamless transition.\n"
    )
    contents = {**pngs, "manifest.json": base.json_bytes(manifest), "character.json": base.json_bytes(config),
                "PROVENANCE.txt": config["provenance"].encode(), "INTEGRATION.md": integration.encode()}
    assert len(json.dumps(config["sourceMetadata"], ensure_ascii=False, separators=(",", ":")).encode()) <= 64 * 1024
    for filename, data in contents.items():
        if not filename.endswith(".png"):
            assert len(data) <= 256 * 1024
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for filename, data in contents.items():
            info = zipfile.ZipInfo(filename, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=6)
    data = buffer.getvalue()
    assert len(data) <= 64 * 1024 * 1024
    target = output / f"{identity}.character.zip"
    target.write_bytes(data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None and set(archive.namelist()) == set(contents)
    for image in source_frames.values():
        image.close()
    return {"character": identity, "sourceSha256": base.sha(source), "packSha256": base.sha(data),
            "packBytes": len(data), "uniqueFrames": len(ids), "nativeSize": [width, height],
            "anchor": manifest["anchor"], "pages": sheets, "actions": actions, "routes": route_report,
            "decodedBytes": sum(sheet["width"] * sheet["height"] * 4 for sheet in sheets), "frameFidelity": fidelity}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, default=ROOT / "artwork/kling-motion/selection.json")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-motion/exports")
    args = parser.parse_args()
    profile = json.loads(args.profile.read_text())
    assert profile["format"] == "gathria-kling-motion-selection" and profile["version"] == 1
    args.output.mkdir(parents=True, exist_ok=True)
    records = [compile_character(identity, profile["characters"][identity], args.output) for identity in ["male", "female"]]
    (args.output / "compilation-report.json").write_bytes(base.json_bytes({
        "format": "gathria-kling-motion-compilation", "version": 1, "passed": True,
        "profileSha256": base.sha(args.profile.read_bytes()), "packs": records,
    }))
    print(json.dumps([{key: record[key] for key in ["character", "uniqueFrames", "packBytes", "decodedBytes"]} for record in records]))


if __name__ == "__main__":
    main()
