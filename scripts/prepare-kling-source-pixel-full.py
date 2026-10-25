#!/usr/bin/env python3
"""Prepare complete Source pixel themes from the four approved original looks.

The approved detail method is retained: fixed full-canvas /4 premultiplied BOX,
one shared 128-color palette, exact native schedules, no redraw or pose fitting.
This script writes only the new full-bank artwork and bundle directories.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import platform
import zipfile

import numpy as np
from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artwork/kling-source-pixel-full"
BUNDLES = ROOT / "docs/kling-source-pixel-full/bundles"
CATALOG = ROOT / "artwork/kling-themes/catalog-index.json"
OLD_PALETTE = ROOT / "artwork/kling-source-pixel-study/palettes/detail-128.json"
ACTIONS = ("idle", "walk", "run", "jump", "celebrate")
NATIVE = (192, 298)
PADDED = (768, 1192)
ANCHOR = {"x": 96, "y": 282, "units": "pixels", "origin": "top-left"}
GENERATOR = "gathria-offline-source-pixel-full-v1"
SHA = lambda data: hashlib.sha256(data).hexdigest()
JSON = lambda value: (json.dumps(value, indent=2) + "\n").encode()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(JSON(value))


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def png(image: Image.Image) -> bytes:
    stream = io.BytesIO()
    image.save(stream, format="PNG", compress_level=9, optimize=False)
    return stream.getvalue()


def archive(files: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    return stream.getvalue()


def projection(source: Image.Image, padding: dict) -> Image.Image:
    padded = Image.new("RGBA", PADDED)
    padded.paste(source, (padding["left"], padding["top"]))
    rgba = np.asarray(padded, dtype=np.uint32)
    shape = (NATIVE[1], 4, NATIVE[0], 4)
    alpha = rgba[:, :, 3]
    sums = alpha.reshape(shape).sum(axis=(1, 3), dtype=np.uint64)
    result = np.zeros((NATIVE[1], NATIVE[0], 4), dtype=np.uint8)
    result[:, :, 3] = (sums + 8) // 16
    for channel in range(3):
        total = (rgba[:, :, channel] * alpha).reshape(shape).sum(axis=(1, 3), dtype=np.uint64)
        result[:, :, channel] = (total + sums // 2) // np.maximum(sums, 1)
    result[result[:, :, 3] == 0] = 0
    return Image.fromarray(result)


def nearest_colors(rgb: np.ndarray, palette: list[list[int]]) -> np.ndarray:
    unique, inverse = np.unique(rgb, axis=0, return_inverse=True)
    colors = np.asarray(palette, dtype=np.int32)
    mapped = np.empty((len(unique), 3), dtype=np.uint8)
    for start in range(0, len(unique), 2048):
        chunk = unique[start:start + 2048].astype(np.int32)
        distances = ((chunk[:, None, :] - colors[None, :, :]) ** 2).sum(axis=2)
        mapped[start:start + len(chunk)] = colors[distances.argmin(axis=1)]
    return mapped[inverse]


def quantize(image: Image.Image, palette: list[list[int]]) -> Image.Image:
    rgba = np.array(image)
    visible = rgba[:, :, 3] > 0
    rgba[:, :, :3][visible] = nearest_colors(rgba[:, :, :3][visible], palette)
    rgba[~visible] = 0
    return Image.fromarray(rgba)


def palette_error(training: np.ndarray, palette: list[list[int]]) -> dict:
    difference = training.astype(np.int32) - nearest_colors(training, palette).astype(np.int32)
    mse = float(np.mean(difference.astype(np.float64) ** 2))
    return {"pixels": len(training), "meanAbsoluteErrorPerChannel": float(np.abs(difference).mean()),
            "meanSquaredErrorPerChannel": mse, "rootMeanSquaredErrorPerChannel": math.sqrt(mse)}


def read_source(character: str, look: str, entry: dict) -> dict:
    path = ROOT / entry["file"]
    data = path.read_bytes()
    assert SHA(data) == entry["sha256"] and len(data) == entry["bytes"]
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        manifest_raw, config_raw = z.read("manifest.json"), z.read("character.json")
        manifest, config = json.loads(manifest_raw), json.loads(config_raw)
        width, height = (manifest["spritesheet"][k] for k in ("frameWidth", "frameHeight"))
        source_anchor = manifest["anchor"]
        left, top = ANCHOR["x"] * 4 - source_anchor["x"], ANCHOR["y"] * 4 - source_anchor["y"]
        padding = {"left": left, "top": top, "right": PADDED[0] - left - width, "bottom": PADDED[1] - top - height}
        assert min(padding.values()) >= 0
        assert padding == ({"left": 32, "top": 130, "right": 32, "bottom": 6} if look == "base" else {"left": 0, "top": 2, "right": 0, "bottom": 6})
        assert set(manifest["animations"]) == set(ACTIONS)
        assert all(clip["fps"] == 24 for clip in manifest["animations"].values())
        sheets = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        current, page_image = None, None
        frames, native_hashes = {}, {}
        for cell in manifest["frames"]:
            page = cell.get("page", 0)
            if page != current:
                if page_image is not None:
                    page_image.close()
                page_image = Image.open(io.BytesIO(z.read(sheets[page]["file"]))).convert("RGBA")
                current = page
            x, y, w, h = (cell[k] for k in ("x", "y", "width", "height"))
            assert (w, h) == (width, height)
            image = page_image.crop((x, y, x + w, y + h))
            native_hashes[str(cell["id"])] = SHA(image.tobytes())
            frames[cell["id"]] = projection(image, padding)
        if page_image is not None:
            page_image.close()
    timeline = [fid for action in ACTIONS for fid in manifest["animations"][action]["frames"]]
    assert set(timeline) == set(frames)
    assert {f["frameId"] for f in config["derivation"]["frames"]} == set(frames)
    training = np.concatenate([np.asarray(frames[f])[:, :, :3][np.asarray(frames[f])[:, :, 3] >= 128] for f in timeline])
    return {"character": character, "look": look, "manifest": manifest, "config": config, "frames": frames,
            "training": training, "source": {"file": entry["file"], "sha256": entry["sha256"], "bytes": entry["bytes"],
                "manifestSha256": SHA(manifest_raw), "configurationSha256": SHA(config_raw),
                "nativeFrame": [width, height], "anchor": source_anchor, "padding": padding,
                "mappedAnchor": ANCHOR, "nativePixelSha256": native_hashes,
                "sourceCells": manifest["frames"]}}


def diagnostics(frames: dict, animations: dict, title: str) -> Image.Image:
    # Four original timeline positions per action. Full banks remain in atlases.
    tw, th = NATIVE[0] + 8, NATIVE[1] + 26
    image = Image.new("RGB", (tw * 4, th * len(ACTIONS) + 30), "#edf0f4")
    draw = ImageDraw.Draw(image)
    draw.text((8, 8), title + " / native 1x / offline diagnostic", fill="#293547")
    for row, action in enumerate(ACTIONS):
        clip = animations[action]
        for col in range(4):
            tick = round(col * (len(clip["frames"]) - 1) / 3)
            fid = clip["frames"][tick]
            x, y = col * tw + 4, row * th + 30
            draw.text((x, y + 3), f"{action} tick {tick:02d} / source {fid}", fill="#293547")
            image.paste(frames[fid], (x, y + 22), frames[fid])
    return image


def build(art: Path, bundles: Path) -> None:
    art.mkdir(parents=True, exist_ok=True)
    bundles.mkdir(parents=True, exist_ok=True)
    catalog_bytes = CATALOG.read_bytes()
    catalog = json.loads(catalog_bytes)
    original_entries = {e["character"]: e for e in catalog if e["key"] == f"{e['character']}:kling-original@1"}
    old_palette_raw = OLD_PALETTE.read_bytes()
    old_palette = json.loads(old_palette_raw)["colors"]
    banks = []
    for character in ("male", "female"):
        assets = {look["logicalId"]: look for look in original_entries[character]["lookAssets"]}
        for look in ("base", "wedding"):
            bank = read_source(character, look, assets[look])
            banks.append(bank)
            print(f"Projected {character}/{look}: {len(bank['frames'])} source cells", flush=True)
    training = np.concatenate([bank["training"] for bank in banks])
    fitted = Image.fromarray(training.reshape((-1, 1, 3))).quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    raw_palette = fitted.getpalette()[:384]
    colors = [raw_palette[i:i + 3] for i in range(0, len(raw_palette), 3)]
    palette = {"format": "fixed-rgb-palette", "id": "kling-source-pixel-full-shared-128-v1", "colors": colors,
        "colorCount": 128, "trainingRgbSha256": SHA(training.tobytes()), "trainingPixels": len(training),
        "training": "All four complete timeline banks ordered male/base, male/wedding, female/base, female/wedding; idle,walk,run,jump,celebrate; original repeats weighted by their duration; fixed /4 projected pixels alpha>=128; no sampling.",
        "algorithm": "Pillow MEDIANCUT once across every bank; no dither. Exact nearest squared encoded-sRGB distance; first palette index wins ties.",
        "priorStudyPalette": {"file": rel(OLD_PALETTE), "sha256": SHA(old_palette_raw), "retainedUnchanged": True},
        "errorEvaluation": {}}
    del training, fitted
    for bank in banks:
        key = f"{bank['character']}/{bank['look']}"
        palette["errorEvaluation"][key] = {
            "mask": "Projected alpha>=128, every original timeline position including holds; all channels in encoded sRGB (0..255).",
            "frozenStudy128": palette_error(bank["training"], old_palette),
            "fullShared128": palette_error(bank["training"], colors),
        }
        del bank["training"]
    palette_path = art / "palette.json"
    write_json(palette_path, palette)
    palette_sha = SHA(palette_path.read_bytes())
    swatches = Image.new("RGB", (256, 128))
    draw = ImageDraw.Draw(swatches)
    for i, color in enumerate(colors):
        x, y = (i % 16) * 16, (i // 16) * 16
        draw.rectangle((x, y, x + 15, y + 15), fill=tuple(color))
    (art / "palette.png").write_bytes(png(swatches))
    output_rows, look_assets, theme_looks = [], {"male": [], "female": []}, {"male": [], "female": []}
    packs = {"male": {}, "female": {}}
    for bank in banks:
        character, look = bank["character"], bank["look"]
        source, original_manifest, original_config = bank["source"], bank["manifest"], bank["config"]
        folder = art / "prepared" / character / look
        folder.mkdir(parents=True, exist_ok=True)
        processed = {fid: quantize(image, colors) for fid, image in bank["frames"].items()}
        frame_stats = []
        for fid, image in processed.items():
            alpha = np.asarray(image)[:, :, 3]
            original_alpha = np.asarray(bank["frames"][fid])[:, :, 3]
            assert np.array_equal(alpha, original_alpha)
            frame_stats.append({"id": fid, "rgbaSha256": SHA(image.tobytes()), "alphaSha256": SHA(alpha.tobytes()),
                "sourceRgbaSha256": source["nativePixelSha256"][str(fid)], "alphaMatchesFixedProjection": True,
                "silhouetteIoUVersusFixedProjection": 1.0, "softAlphaIoUVersusFixedProjection": 1.0,
                "alphaSum": int(alpha.sum(dtype=np.uint64)), "partialAlphaPixels": int(((alpha > 0) & (alpha < 255)).sum()),
                "bboxAlphaNonzero": list(image.getchannel("A").getbbox())})
        ids = list(processed)  # Retain the input manifest cell order as well as IDs.
        columns, rows = 8, math.ceil(len(ids) / 8)
        sheet = Image.new("RGBA", (columns * NATIVE[0], rows * NATIVE[1]))
        cells = []
        for i, fid in enumerate(ids):
            x, y = (i % columns) * NATIVE[0], (i // columns) * NATIVE[1]
            sheet.paste(processed[fid], (x, y))
            cells.append({"id": fid, "x": x, "y": y, "width": NATIVE[0], "height": NATIVE[1], "page": 0})
        atlas_bytes = png(sheet)
        (folder / "atlas.png").write_bytes(atlas_bytes)
        name = f"Kling {character} · Source pixel · {look}"
        manifest = copy.deepcopy(original_manifest)
        manifest.update({"schemaVersion": 4, "name": name, "generator": GENERATOR,
            "spritesheet": {"file": "spritesheet.png", "width": sheet.width, "height": sheet.height,
                "frameWidth": NATIVE[0], "frameHeight": NATIVE[1], "columns": columns, "rows": rows},
            "additionalSheets": [], "frames": cells, "anchor": ANCHOR,
            "scale": {"pixelArt": True, "integerOnly": True, "recommended": 2},
            "capabilities": {"renderMode": "baked", "editableAppearance": False}, "configuration": "character.json"})
        provenance = (
            "Deterministic offline source-derived pixel processing of this approved catalog-original look; no AI redraw. "
            "All original source frame IDs, order, held repeats, five 24fps animations, loop flags, derivation and motionFlow metadata are retained. "
            "Each whole source canvas receives fixed anchor-derived transparent padding to768x1192, then exact premultiplied-alpha4x4 BOX "
            "in encoded sRGB with round-half-up. Every projected alpha level is retained. One newly fitted shared128-color palette is fixed "
            "across both characters, both looks and all actions, with exact nearest-color assignment and no dithering. "
            "The approved detail study remains unchanged; this full-bank palette improves wedding colors and may slightly change base RGB. "
            "No pose fitting, head locking, warping, interpolation, shadow removal, generated motion, per-frame palette or runtime filter is used. "
            "Source blur, source clipping and original motion imperfections remain. Historical source metadata and derivation describe the retained input."
        )
        config = copy.deepcopy(original_config)
        character_id = f"kling-{character}-source-pixel-v1"
        config.update({"name": name, "characterId": character_id,
            "source": {"kind": "unified-archive", "name": source["file"], "sha256": source["sha256"]},
            "provenance": provenance + "\n\nOriginal source provenance:\n" + original_config["provenance"]})
        processing_metadata = {"version": 1, "method": "fixed-premultiplied-box4-shared128-v1", "sourceDivisor": 4, "character": character, "look": look,
            "sourceCharacterId": original_config["characterId"], "sourcePack": source["file"], "sourceSha256": source["sha256"],
            "sourceSize": source["nativeFrame"], "sourceAnchor": source["anchor"], "sourcePadding": source["padding"],
            "paddedSourceSize": list(PADDED), "nativeFrame": list(NATIVE), "anchor": ANCHOR,
            "bodyTransform": {"scaleNumerator": 1, "scaleDenominator": 4, "translateSourcePixels": [source["padding"]["left"], source["padding"]["top"]]},
            "paletteId": palette["id"], "paletteFile": rel(palette_path), "paletteSha256": palette_sha,
            "timelineUnchanged": True, "derivationUnchanged": True, "sourceMetadataRetained": True,
            "sourceMetadataCoordinates": "Historical source extraction/appearance coordinates, not output coordinates."}
        config["sourceMetadata"]["sourcePixelFull"] = processing_metadata
        assert len(json.dumps(config["sourceMetadata"]).encode()) <= 65536
        assert config["derivation"] == original_config["derivation"]
        for key, value in original_config["sourceMetadata"].items():
            assert config["sourceMetadata"][key] == value
        clip_stats = {}
        for action, clip in manifest["animations"].items():
            unique_ids = set(clip["frames"])
            original_count = len({source["nativePixelSha256"][str(fid)] for fid in unique_ids})
            output_count = len({SHA(processed[fid].tobytes()) for fid in unique_ids})
            assert output_count == original_count
            clip_stats[action] = {"timelineTicks": len(clip["frames"]), "uniqueSourceIds": len(unique_ids),
                "uniqueNativeSourceRgbaPoses": original_count, "uniqueOutputRgbaPoses": output_count,
                "fps": clip["fps"], "loop": clip["loop"], "frames": clip["frames"]}
        metadata = {"format": "kling-source-pixel-full-atlas", "version": 1, "character": character, "look": look,
            "source": source, "manifest": manifest, "atlasSha256": SHA(atlas_bytes),
            "paletteFile": rel(palette_path), "paletteSha256": palette_sha, "processing": processing_metadata,
            "frameStatistics": frame_stats, "clipStatistics": clip_stats,
            "sourceDerivationSha256": SHA(JSON(original_config["derivation"])),
            "retainedSourceMetadataSha256": SHA(JSON(original_config["sourceMetadata"]))}
        write_json(folder / "atlas.json", metadata)
        (folder / "actions.contact-1x.png").write_bytes(png(diagnostics(processed, manifest["animations"], f"{character} / {look} / Source pixel")))
        if look == "base":
            preview = processed[manifest["animations"]["idle"]["frames"][0]].resize((384, 596), Image.Resampling.NEAREST)
            (folder.parent / "preview.png").write_bytes(png(preview))
        integration = (
            "# Source pixel CharacterPack V4\n\n"
            "Use the declared192x298 full canvas and integer anchor(96,282). Render at integer zoom with nearest-neighbor sampling. "
            "Left is the declared whole-frame mirror. Preserve all five native24fps animation schedules, including held IDs and nonlooping jump. "
            "The retained direct sourceMetadata.motionFlow object supplies reviewed transitions and jump return-to-idle behavior. "
            "Source metadata and derivation coordinates are historical provenance; sourcePixelFull records the output transform. "
            "These are baked looks without editable garment layers. All processing is offline; no runtime pixel filter is required.\n"
        )
        pack = archive({"manifest.json": JSON(manifest), "character.json": JSON(config), "spritesheet.png": atlas_bytes,
            "PROVENANCE.txt": (provenance + "\nSource SHA256: " + source["sha256"] + "\n").encode(), "INTEGRATION.md": integration.encode()})
        pack_path = bundles / f"{character}-source-pixel-{look}.character.zip"
        pack_path.write_bytes(pack)
        packs[character][look] = pack
        look_assets[character].append({"logicalId": look, "file": rel(pack_path), "sha256": SHA(pack), "bytes": len(pack)})
        theme_looks[character].append({"logicalId": look, "name": "Original tank & shorts" if look == "base" else "Wedding look",
            "file": f"look-{0 if look == 'base' else 1}.character.zip", "sha256": SHA(pack)})
        output_rows.append({"character": character, "look": look, "metadata": rel(folder / "atlas.json"),
            "atlas": rel(folder / "atlas.png"), "atlasSha256": SHA(atlas_bytes), "pack": rel(pack_path), "packSha256": SHA(pack),
            "frames": len(cells), "timelineTicks": sum(len(c["frames"]) for c in manifest["animations"].values()), "clipStatistics": clip_stats})
        print(f"Packaged {character}/{look}: {len(pack)} bytes, {len(cells)} cells", flush=True)
        del processed, sheet
    entries = []
    for character in ("male", "female"):
        source = next(bank["source"] for bank in banks if bank["character"] == character and bank["look"] == "base")
        theme_manifest = {"format": "gathria-character-theme", "version": 1, "id": "kling-source-pixel", "revision": 1,
            "name": "Source pixel", "character": character, "characterId": f"kling-{character}-source-pixel-v1", "rendering": "pixel",
            "reference": {"sourceSha256": source["sha256"], "description": "Approved original Kling base and wedding looks, uniformly processed offline; complete native motion retained."},
            "provenance": "Source-derived full detail128 processing, version1: one shared fixed128-color palette, fixed aspect-preserving quarter scale, exact source schedules and transition metadata. Both original looks are baked independently; no AI redraw or runtime filter. Original/study assets remain unchanged.",
            "looks": theme_looks[character]}
        theme = archive({"theme.json": JSON(theme_manifest), "look-0.character.zip": packs[character]["base"], "look-1.character.zip": packs[character]["wedding"]})
        theme_path = bundles / f"{character}-source-pixel.theme.zip"
        theme_path.write_bytes(theme)
        entries.append({"key": f"{character}:kling-source-pixel@1", "name": "Source pixel", "character": character,
            "description": "Original Kling anatomy and complete native motion, uniformly sampled into a shared 128-color pixel palette. Base and wedding looks.",
            "isOriginal": False, "file": rel(theme_path), "preview": rel(art / "prepared" / character / "preview.png"),
            "sha256": SHA(theme), "bytes": len(theme), "manifest": theme_manifest, "lookAssets": look_assets[character], "current": True})
    write_json(art / "catalog-index.json", entries)
    assert CATALOG.read_bytes() == catalog_bytes and OLD_PALETTE.read_bytes() == old_palette_raw
    for bank in banks:
        assert SHA((ROOT / bank["source"]["file"]).read_bytes()) == bank["source"]["sha256"]
    write_json(art / "index.json", {"format": "kling-source-pixel-full", "version": 1,
        "generator": GENERATOR, "themeId": "kling-source-pixel", "themeRevision": 1,
        "nativeFrame": list(NATIVE), "paddedSourceFrame": list(PADDED), "anchor": ANCHOR,
        "inputs": [{"character": bank["character"], "look": bank["look"], **bank["source"]} for bank in banks],
        "palette": {"file": rel(palette_path), "sha256": palette_sha, "id": palette["id"]}, "outputs": output_rows,
        "catalogFragment": rel(art / "catalog-index.json"), "originalCatalogSha256AtPreparation": SHA(catalog_bytes),
        "parameters": {"sourceDivisor": 4, "paletteSize": 128, "dither": False,
            "box": "Integer-grid premultiplied-alpha BOX in encoded sRGB. Alpha=round-half-up(sum(a)/16); RGB=round-half-up(sum(rgb*a)/sum(a)); alpha0=>RGBA0.",
            "geometry": "Whole-canvas fixed translation and uniform quarter scale. No crop-fit, pose shift, head lock, redraw, interpolation, shadow removal or sharpening.",
            "paletteFit": "All original timeline ticks across all four looks, alpha>=128 for training only; output alpha is unthresholded.",
            "transitionMetadata": "Entire original derivation and sourceMetadata preserved verbatim; sourcePixelFull added alongside motionFlow."},
        "toolchain": {"python": platform.python_version(), "pillow": PILLOW_VERSION, "numpy": np.__version__,
            "script": rel(Path(__file__).resolve()), "scriptSha256": SHA(Path(__file__).read_bytes())},
        "verification": {"uniqueSourceCells": sum(len(b["frames"]) for b in banks), "timelineTicks": sum(r["timelineTicks"] for r in output_rows),
            "allAlphaMatchesFixedProjection": True, "allNativeUniquePoseCountsRetained": True, "allOriginalDerivationRetained": True,
            "allOriginalSourceMetadataRetained": True, "sourceInputsUnchanged": True, "priorStudyPaletteUnchanged": True, "catalogNotModifiedByPreparation": True}})
    (art / "README.md").write_text(
        "# Source pixel full bank\n\n"
        "Complete detail128 continuation: both characters, original base and wedding looks, all five native actions. "
        "The 368 source cells and 488 original timeline ticks retain exact IDs, order, holds, 24 fps and loop behavior. Jump remains a 39-tick one-shot. "
        "All original derivation and sourceMetadata, including direct motionFlow transitions, are retained.\n\n"
        "All four looks use a 192x298 native canvas and anchor (96,282). Base frames receive fixed source padding left/right 32, top 130, bottom 6; "
        "wedding frames receive top 2, bottom 6. The resulting 768x1192 canvas is sampled uniformly at one quarter scale. "
        "Base geometry matches the prior detail study translated by exactly (+8,+32) output pixels. No source pixels are cropped or individually repositioned.\n\n"
        "The integer premultiplied-alpha BOX method continues the approved detail study. A newly fitted, versioned 128-color palette is shared across all four complete banks. "
        "Palette error comparisons against the unchanged study palette are recorded in palette.json. This improves wedding color coverage, with a modest base RGB tradeoff; "
        "it does not claim identical base color bytes. Alpha is identical to the fixed unquantized projection, without thresholding, dithering, new shadow removal, sharpening or AI redraw.\n\n"
        "index.json records input SHA256, source cell maps, fixed padding, output packages, palette and toolchain. prepared/<character>/<look>/atlas.json records every source/output frame hash, "
        "alpha check, animation and derivation hash. Transparent RGBA8 atlases are authoritative; contact sheets are labeled offline diagnostics. "
        "catalog-index.json is a two-record catalog fragment; the generator never edits the live catalog. Bundles live in docs/kling-source-pixel-full/bundles.\n\n"
        "Regenerate with `/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-full.py`. "
        "Original assets and the earlier bounded study are read-only inputs. Source clipping, blur and original motion imperfections remain.\n"
    )
    print(f"Full bank ready: {len(entries)} themes, {len(output_rows)} looks, 368 source cells", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--art", type=Path, default=ART)
    parser.add_argument("--bundles", type=Path, default=BUNDLES)
    args = parser.parse_args()
    build(args.art.resolve(), args.bundles.resolve())
