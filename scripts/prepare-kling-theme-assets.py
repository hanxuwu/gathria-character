#!/usr/bin/env python3
"""Technical preparation for independently authored character theme sprite banks.

This script extracts immutable source pose guides and packages authored sprites.
It does not redraw a character, synthesize poses, run a style filter, change the
approved source files, or infer an animation from a single standing picture.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artwork/kling-themes"
EXPORTS = ROOT / "docs/kling-themes/bundles"
CELL = (384, 512)
NATIVE = (192, 256)
GUIDE_ACTIONS = {
    "idle": [0, 6, 12, 18],
    "walk": [24, 28, 32, 36, 39, 43, 46, 50],
    "run": [51, 53, 55, 57, 59, 61, 63, 65],
    "jump": [83, 88, 93, 98, 103, 108, 114, 121],
    "celebrate": [67, 70, 73, 75, 79, 82],
}
SHA = lambda b: hashlib.sha256(b).hexdigest()


def dump(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def png(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def zip_bytes(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data)
    return out.getvalue()


class Source:
    def __init__(self, character: str, look: str = "base"):
        self.path = ROOT / (f"docs/kling-motion/exports/{character}.character.zip" if look == "base" else f"docs/kling-paint-roundtrip/evidence/{character}-wedding-before.character.zip")
        self.bytes = self.path.read_bytes()
        self.sha = SHA(self.bytes)
        self.zip = zipfile.ZipFile(io.BytesIO(self.bytes))
        self.manifest = json.loads(self.zip.read("manifest.json"))
        self.recipe = json.loads(self.zip.read("character.json"))
        self.frames = {row["id"]: row for row in self.manifest["frames"]}
        self.sheets = [self.manifest["spritesheet"], *self.manifest.get("additionalSheets", [])]
        self.current_page = None
        self.image = None

    def frame(self, frame_id: int) -> Image.Image:
        frame = self.frames[frame_id]
        page = frame.get("page", 0)
        if self.current_page != page:
            if self.image:
                self.image.close()
            self.image = Image.open(io.BytesIO(self.zip.read(self.sheets[page]["file"]))).convert("RGBA")
            self.current_page = page
        return self.image.crop((frame["x"], frame["y"], frame["x"] + frame["width"], frame["y"] + frame["height"]))

    def close(self) -> None:
        if self.image:
            self.image.close()
        self.zip.close()


def make_guides(character: str, look: str = "base") -> None:
    source = Source(character, look)
    out = ART / "source-guides" / character
    if look != "base": out = out / look
    out.mkdir(parents=True, exist_ok=True)
    guide_actions = GUIDE_ACTIONS if look == "base" else {**{a: GUIDE_ACTIONS[a] for a in ["walk", "run", "jump"]}, "idle-celebrate": [0, 6, 12, 18, 67, 73, 75, 82]}
    frame_width = source.manifest["spritesheet"]["frameWidth"]
    frame_height = source.manifest["spritesheet"]["frameHeight"]
    ratio = min(320 / frame_width, 480 / frame_height)
    draw_size = (round(frame_width * ratio), round(frame_height * ratio))
    offset = ((CELL[0] - draw_size[0]) // 2, 16)
    for action, frame_ids in guide_actions.items():
        columns = 2 if action == "idle" else 3 if action == "celebrate" else 4
        sheet = Image.new("RGBA", (columns * CELL[0], 2 * CELL[1]))
        for index, frame_id in enumerate(frame_ids):
            # Identical full-frame transform for EVERY source pose. No bbox-fit,
            # recentering, foot pinning, or alteration of jump elevation.
            frame = source.frame(frame_id).resize(draw_size, Image.Resampling.LANCZOS)
            sheet.alpha_composite(frame, ((index % columns) * CELL[0] + offset[0], (index // columns) * CELL[1] + offset[1]))
        image_path = out / f"{action}.png"
        sheet.save(image_path)
        animation = source.manifest["animations"].get(action, {a: source.manifest["animations"][a] for a in ["idle", "celebrate"]})
        dump(out / f"{action}.json", {
            "kind": "unchanged-source-pose-guide",
            "character": character,
            "look": look,
            "sourceFile": str(source.path.relative_to(ROOT)),
            "sourceSha256": source.sha,
            "sourceCharacterId": source.recipe["characterId"],
            "sourceAnimation": animation,
            "selectedFrameIds": frame_ids,
            "cell": {"width": CELL[0], "height": CELL[1], "columns": columns, "rows": 2},
            "commonTransform": {"sourceFrame": [frame_width, frame_height], "drawSize": list(draw_size), "offset": list(offset)},
            "guideAnchor": {"x": offset[0] + source.manifest["anchor"]["x"] * draw_size[0] / frame_width, "y": offset[1] + source.manifest["anchor"]["y"] * draw_size[1] / frame_height},
            "sha256": SHA(image_path.read_bytes()),
            "notes": "Pose reference only. Re-authored theme drawings are not extracted video frames. Common scale/offset preserve source relative placement and airborne height. The selected poses do not alone prescribe output timing.",
        })
        print(image_path.relative_to(ROOT), flush=True)
    source.close()


def original_theme(character: str) -> None:
    source = Source(character)
    wedding = Source(character, "wedding")
    assert wedding.recipe["characterId"] == source.recipe["characterId"]
    manifest = {
        "format": "gathria-character-theme",
        "version": 1,
        "id": "kling-original",
        "revision": 1,
        "name": "Kling original",
        "character": character,
        "characterId": source.recipe["characterId"],
        "rendering": "smooth",
        "reference": {"sourceSha256": source.sha, "description": "Approved Kling source-video character; exact retained motion-flow archive."},
        "provenance": "The base look wraps the unchanged Kling motion & transitions CharacterPack. The wedding look wraps the unchanged prior application export docs/kling-paint-roundtrip/evidence/" + character + "-wedding-before.character.zip, including its reviewed clothing, hairstyle and facial choice. Both nested archives retain exact original bytes, native dimensions, anchors and schedules. They are complete baked looks, not interchangeable garment layers. No artwork is newly generated in this original-theme wrapper.",
        "looks": [
            {"logicalId": "base", "name": "Original tank & shorts", "file": "look-0.character.zip", "sha256": source.sha},
            {"logicalId": "wedding", "name": "Wedding look", "file": "look-1.character.zip", "sha256": wedding.sha},
        ],
    }
    data = zip_bytes({"theme.json": json.dumps(manifest, indent=2).encode(), "look-0.character.zip": source.bytes, "look-1.character.zip": wedding.bytes})
    EXPORTS.mkdir(parents=True, exist_ok=True)
    target = EXPORTS / f"{character}-original.theme.zip"
    target.write_bytes(data)
    print(target.relative_to(ROOT), SHA(data), flush=True)
    source.close()
    wedding.close()


def build_pixel(recipe_path: Path) -> None:
    """Crop a declared uniform grid of separately authored drawings, then pack it.

    The source recipe must record the actual generated artwork, provenance and
    generation prompt files. Only a common integer sampling step is supported;
    per-pose scaling, hidden interpolation and generated in-betweens are absent.
    """
    recipe_path = recipe_path.resolve()
    recipe_bytes = recipe_path.read_bytes()
    recipe = json.loads(recipe_bytes)
    character = recipe["character"]
    assert character in ("male", "female")
    identity = recipe.get("id", "pixel-storybook")
    revision = recipe.get("revision", 1)
    look_id = recipe.get("lookId", "base")
    assert look_id in ("base", "wedding")
    native_width, native_height = recipe.get("frameSize", NATIVE)
    sample = recipe.get("integerSample", 2)
    assert type(sample) is int and sample >= 1
    padding = recipe.get("registrationPadding", {"left": 0, "top": 0, "right": 0, "bottom": 0})
    assert set(padding) == {"left", "top", "right", "bottom"} and all(type(v) is int and v >= 0 for v in padding.values())
    output_size = (native_width * sample, native_height * sample)
    assert output_size == (CELL[0] + padding["left"] + padding["right"], CELL[1] + padding["top"] + padding["bottom"]), "All poses share the same grid/sample/padding; do not resize per pose."
    anchor = recipe.get("anchor", {"x": 96, "y": 235})
    assert all(type(anchor[k]) is int for k in ("x", "y"))
    assert 0 <= anchor["x"] <= native_width and 0 <= anchor["y"] <= native_height
    source = Source(character)
    cells: list[Image.Image] = []
    actions: dict[str, dict] = {}
    source_rows = []
    generation_sources = []
    action_files = recipe["actions"]
    assert set(action_files) == set(GUIDE_ACTIONS), "Published theme must provide all five authored actions."
    for action in GUIDE_ACTIONS:
        entry = action_files[action]
        file = (recipe_path.parent / entry["file"]).resolve()
        raw = file.read_bytes()
        with Image.open(io.BytesIO(raw)) as source_image:
            source_image.load()
            assert source_image.mode == "RGBA", f"{action}: genuine alpha PNG required."
            columns, rows = entry["columns"], entry["rows"]
            assert source_image.size == tuple(entry.get("sourceSize", [CELL[0] * columns, CELL[1] * rows])), f"{action}: unexpected grid dimensions {source_image.size}"
            indices = entry.get("cellIndices", list(range(entry.get("count", columns * rows))))
            count = len(indices)
            assert 1 <= count <= columns * rows
            assert all(type(i) is int and 0 <= i < columns * rows for i in indices)
            assert len(set(indices)) == len(indices)
            declared_rects = entry.get("cropRects")
            if declared_rects is not None:
                assert len(declared_rects) == count
            first_id = len(cells)
            for index, source_index in enumerate(indices):
                x, y = (source_index % columns) * CELL[0], (source_index // columns) * CELL[1]
                rect = declared_rects[index] if declared_rects else [x, y, CELL[0], CELL[1]]
                x, y, width, height = rect
                assert all(type(v) is int for v in rect) and x >= 0 and y >= 0 and width > 0 and height > 0
                assert x + width <= source_image.width and y + height <= source_image.height
                cell = source_image.crop((x, y, x + width, y + height))
                alpha = cell.getchannel("A")
                minimum, maximum = alpha.getextrema()
                assert minimum == 0 and maximum >= 250, f"{action} pose {index}: transparent margin/near-opaque drawing required."
                # Reject clipped artwork at a cell boundary. Do not crop it away.
                edge = [alpha.crop((0, 0, width, 1)), alpha.crop((0, height - 1, width, height)), alpha.crop((0, 0, 1, height)), alpha.crop((width - 1, 0, width, height))]
                assert all(e.getextrema()[1] <= 16 for e in edge), f"{action} pose {index}: drawing or background touches grid boundary."
                translation = entry.get("translations", [[0, 0]] * count)[index]
                assert len(translation) == 2 and all(type(v) is int for v in translation)
                if translation != [0, 0] or cell.size != output_size or any(padding.values()):
                    dx, dy = translation[0] + padding["left"], translation[1] + padding["top"]
                    # Explicit registration is translation only. Refuse to clip
                    # the actual opaque drawing; <=16-alpha edge haze from the
                    # generation tool is not interpreted as anatomy.
                    visible = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
                    assert visible and visible[0] + dx >= 0 and visible[1] + dy >= 0 and visible[2] + dx <= output_size[0] and visible[3] + dy <= output_size[1], f"{action} pose {index}: registration would clip drawing."
                    registered = Image.new("RGBA", output_size)
                    registered.paste(cell, (dx, dy))
                    cell = registered
                native = cell.resize((native_width, native_height), Image.Resampling.NEAREST)
                assert native.getbbox(), f"{action} pose {index}: empty drawing."
                cells.append(native)
                source_rows.append({"frameId": first_id + index, "sourceFrame": source_index, "timeSeconds": 0})
            timeline = entry.get("timeline", list(range(count)))
            assert timeline and all(type(i) is int and 0 <= i < count for i in timeline)
            fps = entry["fps"]
            assert 0.1 <= fps <= 60
            loop = entry.get("loop", action != "jump")
            assert type(loop) is bool
            if action == "jump":
                assert loop is False, "Jump is a one-shot authored action."
            actions[action] = {"frames": [first_id + i for i in timeline], "fps": fps, "loop": loop}
            guide_action = "idle-celebrate" if look_id == "wedding" and action in ("idle", "celebrate") else action
            generation_sources.append({"action": action, "file": str(file.relative_to(ROOT)), "sha256": SHA(raw), "columns": columns, "rows": rows, "count": count, "cellIndices": indices, "cropRects": declared_rects, "translations": entry.get("translations", [[0, 0]] * count), "sourceGuide": f"artwork/kling-themes/source-guides/{character}/" + ("wedding/" if look_id == "wedding" else "") + f"{guide_action}.json", "notes": entry.get("notes", "AI-authored drawings guided by approved character poses, not extracted video frames.")})
    columns = 8
    rows = math.ceil(len(cells) / columns)
    atlas = Image.new("RGBA", (native_width * columns, native_height * rows))
    frames = []
    for index, cell in enumerate(cells):
        x, y = index % columns * native_width, index // columns * native_height
        atlas.paste(cell, (x, y))
        frames.append({"id": index, "page": 0, "x": x, "y": y, "width": native_width, "height": native_height})
    character_id = f"kling-{character}-{identity}-v{revision}"
    name = recipe.get("name", "Pixel storybook")
    manifest = {
        "schemaVersion": 4, "format": "gathria-character-pack", "name": f"Kling {character} · {name}",
        "generator": "gathria-authored-theme-v1",
        "spritesheet": {"file": "spritesheet.png", "width": atlas.width, "height": atlas.height, "frameWidth": native_width, "frameHeight": native_height, "columns": columns, "rows": rows},
        "additionalSheets": [], "frames": frames, "animations": actions,
        "facing": {"native": "right", "right": "none", "left": "mirror-x"},
        "anchor": {**anchor, "units": "pixels", "origin": "top-left"},
        "scale": {"pixelArt": True, "recommended": 2, "integerOnly": True},
        "capabilities": {"renderMode": "baked", "editableAppearance": False}, "configuration": "character.json",
    }
    provenance = recipe["provenance"]
    assert isinstance(provenance, str) and provenance.strip()
    config = {
        "format": "gathria-baked-character", "schemaVersion": 1, "name": manifest["name"], "characterId": character_id,
        "source": {"kind": "unified-archive", "name": f"{name} authored sprite source recipe", "sha256": SHA(recipe_bytes)},
        "provenance": provenance,
        "derivation": {"method": "AI-authored independent pixel sprite drawings; fixed-grid extraction and uniform integer sampling only. Timeline authored for these drawings. No geometric rig deformation, generated runtime frames, or claim of video-pixel extraction.", "frames": source_rows},
        "sourceMetadata": {"theme": {"id": identity, "revision": revision, "character": character, "lookId": look_id, "lookName": recipe.get("lookName", "Tank & shorts"), "referenceSourceSha256": source.sha, "rendering": "pixel", "sourceRecipeSha256": SHA(recipe_bytes), "generatedSources": generation_sources, "uniformSample": sample, "nativeFrame": [native_width, native_height], "registrationPadding": padding, "provenance": provenance}},
    }
    provenance_text = (f"Authored pixel character: {manifest['name']}\nLook: {look_id}\n\n{provenance}\n\n"
        f"Source recipe: {recipe_path.relative_to(ROOT)}\nSHA256: {SHA(recipe_bytes)}\n"
        f"Reference Kling archive: {source.path.relative_to(ROOT)}\nReference SHA256: {source.sha}\n\n"
        "The generated sheets are independently authored artwork, not extracted video pixels. "
        "character.json records every generated source hash, crop, registration translation, common sampling step and timeline. "
        "Source PNGs, exact generation records where retained, and technical recipes are preserved in the project. "
        "No runtime drawing API, theme filter, skeletal deformation or generated in-between frames are required.\n")
    integration_text = ("# CharacterPack V4: authored pixel artwork\n\n"
        "Load manifest.json, character.json and every declared atlas PNG. Page 0 is spritesheet; additionalSheets may be empty. "
        "Each frame has an explicit page and an unscaled rectangle. Preserve the native 192 x 272 frame and the frame-relative anchor (96, 251).\n\n"
        "Honor scale.pixelArt=true and scale.integerOnly=true: render with nearest-neighbor sampling at a positive integer zoom. "
        "Do not smooth, normalize separate poses or resize exported artwork. V2/V3-only consumers must explicitly reject V4.\n\n"
        "Play the listed frame IDs at each animation's declared FPS. Repeated IDs are intentional holds. "
        "Honor loop; the one-shot jump stops on its last frame until explicitly replayed or another action is selected. "
        "The native direction is right; mirror horizontally around the declared anchor for left. These clips animate in place, without world displacement.\n\n"
        "This is a complete baked look for independent playback, not editable garment layers or a skeleton. "
        "Source artwork, identity, registration and timing are described in character.json and PROVENANCE.txt. "
        "The editor and theme catalog are not needed to play this CharacterPack.\n")
    character_pack = zip_bytes({"manifest.json": json.dumps(manifest, indent=2).encode(), "character.json": json.dumps(config, indent=2).encode(), "spritesheet.png": png(atlas), "PROVENANCE.txt": provenance_text.encode(), "INTEGRATION.md": integration_text.encode()})
    EXPORTS.mkdir(parents=True, exist_ok=True)
    prefix = f"{character}-{identity}"
    pack_suffix = "" if look_id == "base" else "-" + look_id
    (EXPORTS / f"{prefix}{pack_suffix}.character.zip").write_bytes(character_pack)
    theme_looks = []
    theme_files = {}
    look_provenance = []
    for candidate_id in ["base", "wedding"]:
        candidate_suffix = "" if candidate_id == "base" else "-" + candidate_id
        candidate_path = EXPORTS / f"{prefix}{candidate_suffix}.character.zip"
        if not candidate_path.exists(): continue
        candidate_bytes = candidate_path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(candidate_bytes)) as candidate_zip:
            candidate_recipe = json.loads(candidate_zip.read("character.json"))
        candidate_theme = candidate_recipe["sourceMetadata"]["theme"]
        assert candidate_theme["id"] == identity and candidate_theme["revision"] == revision and candidate_theme["lookId"] == candidate_id
        assert candidate_recipe["characterId"] == character_id and candidate_theme["character"] == character and candidate_theme["rendering"] == "pixel"
        index = len(theme_looks); file = f"look-{index}.character.zip"
        theme_files[file] = candidate_bytes
        theme_looks.append({"logicalId": candidate_id, "name": candidate_theme["lookName"], "file": file, "sha256": SHA(candidate_bytes)})
        look_provenance.append(candidate_id + ": " + candidate_recipe["provenance"])
    theme = {
        "format": "gathria-character-theme", "version": 1, "id": identity, "revision": revision, "name": name,
        "character": character, "characterId": character_id, "rendering": "pixel",
        "reference": {"sourceSha256": source.sha, "description": "Approved Kling character identity and pose references; independent authored pixel drawings have their own native dimensions, anchors and timing."},
        "provenance": "Each complete look is authored and registered independently. " + "\n\n".join(look_provenance),
        "looks": theme_looks,
    }
    theme_bytes = zip_bytes({"theme.json": json.dumps(theme, indent=2).encode(), **theme_files})
    (EXPORTS / f"{prefix}.theme.zip").write_bytes(theme_bytes)
    prepared = ART / "prepared" / character / identity
    if look_id != "base": prepared = prepared / look_id
    prepared.mkdir(parents=True, exist_ok=True)
    atlas.save(prepared / "spritesheet.png")
    cells[0].save(prepared / "preview.png")
    dump(prepared / "preparation.json", {"recipe": str(recipe_path.relative_to(ROOT)), "recipeSha256": SHA(recipe_bytes), "characterPackSha256": SHA(character_pack), "themeSha256": SHA(theme_bytes), "frameCount": len(cells), "sourceFiles": generation_sources, "method": config["derivation"]["method"]})
    # A later look changes the enclosing theme, while nested character packs stay
    # byte-identical. Keep every existing preparation record tied to that final
    # envelope rather than retaining an obsolete single-look bundle hash.
    for record_path in (ART / "prepared" / character / identity).rglob("preparation.json"):
        record = json.loads(record_path.read_text())
        record["themeSha256"] = SHA(theme_bytes)
        dump(record_path, record)
    source.close()
    print(EXPORTS / f"{prefix}.theme.zip", SHA(theme_bytes), flush=True)


def catalog_index() -> None:
    entries = []
    for path in sorted(EXPORTS.glob("*.theme.zip")):
        raw = path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            theme = json.loads(z.read("theme.json"))
        character = theme["character"]
        original = theme["id"] == "kling-original"
        preview = f"artwork/kling-jump/prepared/{character}-library-preview.png" if original else f"artwork/kling-themes/prepared/{character}/{theme['id']}/preview.png"
        entries.append({
            "key": f"{character}:{theme['id']}@{theme['revision']}", "name": theme["name"], "character": character,
            "description": "Retained source and wedding artwork, with exact saved CharacterPack bytes." if original else "Independently authored pixel drawings, with their own anchors and animation timing. Full-look variant; no interchangeable garment layers.",
            "isOriginal": original, "file": str(path.relative_to(ROOT)), "preview": preview,
            "sha256": SHA(raw), "bytes": len(raw),
        })
    dump(ART / "catalog-index.json", entries)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["guides", "originals", "pixel", "catalog"])
    parser.add_argument("--character", choices=["male", "female", "both"], default="both")
    parser.add_argument("--look", choices=["base", "wedding", "both"], default="base", help="Source pose guides only; originals always retain both looks.")
    parser.add_argument("--recipe", type=Path)
    args = parser.parse_args()
    if args.command == "catalog":
        catalog_index()
        return
    if args.command == "pixel":
        assert args.recipe, "Provide the source/art/timing recipe."
        build_pixel(args.recipe)
        catalog_index()
        return
    for character in (["male", "female"] if args.character == "both" else [args.character]):
        if args.command == "guides":
            for look in (["base", "wedding"] if args.look == "both" else [args.look]):
                make_guides(character, look)
        else:
            original_theme(character)
    if args.command == "originals":
        catalog_index()


if __name__ == "__main__":
    main()
