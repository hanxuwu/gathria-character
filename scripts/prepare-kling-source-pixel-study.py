#!/usr/bin/env python3
"""Bounded, deterministic pixel processing of approved Kling source frames.

This offline study retains native source IDs, schedules, full-frame placement,
and source anatomy. It never redraws, crops to a silhouette, stabilizes poses,
interpolates, removes shadows, or changes application defaults.
"""
from __future__ import annotations

import argparse
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
DEFAULT_OUTPUT = ROOT / "artwork/kling-source-pixel-study"
NATIVE = (176, 266)
SOURCE_PADDING = {"top": 2, "bottom": 6, "left": 0, "right": 0}
VARIANTS = (
    {"id": "detail-128", "sourceDivisor": 4, "paletteSize": 128, "nearestExpansion": 1},
    {"id": "compact-64", "sourceDivisor": 8, "paletteSize": 64, "nearestExpansion": 2},
)
SCOPE = {"male": ("idle", "walk", "run"), "female": ("idle", "walk")}
PRIMARY = {"male": "run", "female": "walk"}
SHA = lambda data: hashlib.sha256(data).hexdigest()


def dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def save_png(path: Path, image: Image.Image) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=False, compress_level=9)
    return SHA(path.read_bytes())


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


class Source:
    """Read only one source atlas page at a time; never unpack original archives."""

    def __init__(self, character: str):
        self.path = ROOT / f"docs/kling-motion/exports/{character}.character.zip"
        data = self.path.read_bytes()
        self.sha = SHA(data)
        self.archive = zipfile.ZipFile(io.BytesIO(data))
        manifest_bytes = self.archive.read("manifest.json")
        self.manifest = json.loads(manifest_bytes)
        self.manifest_sha = SHA(manifest_bytes)
        self.recipe = json.loads(self.archive.read("character.json"))
        self.cells = {f["id"]: f for f in self.manifest["frames"]}
        self.sheets = [self.manifest["spritesheet"], *self.manifest.get("additionalSheets", [])]
        self.page = None
        self.image = None

    def frame(self, frame_id: int) -> Image.Image:
        cell = self.cells[frame_id]
        page = cell.get("page", 0)
        if page != self.page:
            if self.image is not None:
                self.image.close()
            self.image = Image.open(io.BytesIO(self.archive.read(self.sheets[page]["file"]))).convert("RGBA")
            self.page = page
        x, y, w, h = (cell[k] for k in ("x", "y", "width", "height"))
        return self.image.crop((x, y, x + w, y + h))

    def close(self) -> None:
        if self.image is not None:
            self.image.close()
        self.archive.close()


def box_projection(source: Image.Image, divisor: int) -> Image.Image:
    """Exact integer-grid BOX in encoded sRGB, with premultiplied alpha.

    A = round-half-up(sum(alpha)/n)
    RGB = round-half-up(sum(encoded_sRGB * alpha)/sum(alpha)).
    Fully transparent output is canonical RGBA zero. No gamma conversion,
    sharpening, threshold, outline treatment, or dither is applied.
    """
    rgba = np.asarray(source, dtype=np.uint32)
    h, w = rgba.shape[:2]
    assert w % divisor == h % divisor == 0
    shape = (h // divisor, divisor, w // divisor, divisor)
    alpha = rgba[:, :, 3]
    sums = alpha.reshape(shape).sum(axis=(1, 3), dtype=np.uint64)
    result = np.zeros((h // divisor, w // divisor, 4), dtype=np.uint8)
    n = divisor * divisor
    result[:, :, 3] = (sums + n // 2) // n
    denominator = np.maximum(sums, 1)
    for channel in range(3):
        color_sum = (rgba[:, :, channel] * alpha).reshape(shape).sum(axis=(1, 3), dtype=np.uint64)
        result[:, :, channel] = (color_sum + sums // 2) // denominator
    result[result[:, :, 3] == 0] = 0
    return Image.fromarray(result)


def pad_source(source: Image.Image) -> Image.Image:
    # Universal transparent padding keeps both integer grids and the mapped
    # source anchor exact. It never crops, scales, or moves frames individually.
    padded = Image.new("RGBA", (source.width, source.height + 8))
    padded.paste(source, (0, 2))
    return padded


def shared_palette(training: np.ndarray, count: int) -> list[list[int]]:
    # The ordered training pool contains all scoped timeline ticks, including
    # their original holds. One fixed palette is reused by every character.
    quantized = Image.fromarray(training.reshape((-1, 1, 3))).quantize(
        colors=count, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    palette = quantized.getpalette()[: count * 3]
    return [palette[i:i + 3] for i in range(0, len(palette), 3)]


def apply_palette(projection: Image.Image, colors: list[list[int]]) -> Image.Image:
    # Explicit exact nearest RGB avoids Pillow's approximate color-lookup cache.
    # Sorted unique colors and np.argmin's first match make ties deterministic.
    rgba = np.array(projection)
    visible = rgba[:, :, 3] > 0
    unique, inverse = np.unique(rgba[:, :, :3][visible], axis=0, return_inverse=True)
    palette = np.asarray(colors, dtype=np.int32)
    mapped = np.empty((len(unique), 3), dtype=np.uint8)
    for start in range(0, len(unique), 2048):
        chunk = unique[start:start + 2048].astype(np.int32)
        distance = ((chunk[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
        mapped[start:start + len(chunk)] = palette[distance.argmin(axis=1)]
    rgba[:, :, :3][visible] = mapped[inverse]
    rgba[~visible] = 0
    return Image.fromarray(rgba)


def alpha_summary(image: Image.Image) -> dict:
    alpha = np.asarray(image)[:, :, 3]
    mass = float(alpha.sum(dtype=np.uint64))
    ys, xs = np.indices(alpha.shape)
    return {
        "rgbaSha256": SHA(image.tobytes()),
        "alphaSha256": SHA(alpha.tobytes()),
        "alphaSum": int(mass),
        "nonzeroAlphaPixels": int((alpha > 0).sum()),
        "partialAlphaPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "bboxAlphaNonzero": list(image.getchannel("A").getbbox()),
        "alphaWeightedCentroid": [float((xs * alpha).sum() / mass), float((ys * alpha).sum() / mass)],
    }


def compare_alpha(actual: Image.Image, reference: Image.Image) -> dict:
    a = np.asarray(actual)[:, :, 3].astype(np.int32)
    b = np.asarray(reference)[:, :, 3].astype(np.int32)
    union = (a > 0) | (b > 0)
    hard_a, hard_b = a >= 128, b >= 128
    return {
        "alphaBytesEqual": bool(np.array_equal(a, b)),
        "softAlphaIoU": float(np.minimum(a, b).sum() / np.maximum(a, b).sum()),
        "silhouetteIoUAt128": float((hard_a & hard_b).sum() / (hard_a | hard_b).sum()),
        "meanAbsoluteAlphaErrorOnUnion": float(np.abs(a - b)[union].mean()),
        "maxAbsoluteAlphaError": int(np.abs(a - b).max()),
    }


def checker(size: tuple[int, int], square: int = 8) -> Image.Image:
    ys, xs = np.indices((size[1], size[0]))
    mask = ((xs // square + ys // square) % 2).astype(bool)
    pixels = np.empty((size[1], size[0], 3), dtype=np.uint8)
    pixels[:] = (232, 235, 239)
    pixels[mask] = (216, 221, 227)
    return Image.fromarray(pixels)


def contact_sheet(frames: dict[int, Image.Image], schedule: list[int], scale: int, title: str) -> Image.Image:
    columns = min(8, len(schedule))
    tile_w, tile_h = NATIVE[0] * scale + 8, NATIVE[1] * scale + 22
    sheet = Image.new("RGB", (columns * tile_w, math.ceil(len(schedule) / columns) * tile_h + 30), "#f7f8fa")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), title, fill="#253045")
    for tick, frame_id in enumerate(schedule):
        x, y = (tick % columns) * tile_w, (tick // columns) * tile_h + 30
        draw.text((x + 4, y + 3), f"tick {tick:02d} / source {frame_id}", fill="#253045")
        sprite = frames[frame_id].resize((NATIVE[0] * scale, NATIVE[1] * scale), Image.Resampling.NEAREST)
        background = checker(sprite.size, 8 * scale).convert("RGBA")
        background.alpha_composite(sprite)
        sheet.paste(background.convert("RGB"), (x + 4, y + 20))
    return sheet


def authoring_gif(path: Path, frames: dict[int, Image.Image], schedule: list[int], fps: int, title: str) -> dict:
    # GIF is only a labeled, composited authoring preview. PNG/atlas alpha and
    # the rational 24fps manifest schedule are authoritative.
    scale = 2
    rgb_frames = []
    durations = [
        (math.floor((i + 1) * 100 / fps + 0.5) - math.floor(i * 100 / fps + 0.5)) * 10
        for i in range(len(schedule))
    ]
    for tick, frame_id in enumerate(schedule):
        sprite = frames[frame_id].resize((NATIVE[0] * scale, NATIVE[1] * scale), Image.Resampling.NEAREST)
        background = checker(sprite.size, 16).convert("RGBA")
        background.alpha_composite(sprite)
        image = Image.new("RGB", (sprite.width, sprite.height + 44), "#f7f8fa")
        image.paste(background.convert("RGB"), (0, 44))
        draw = ImageDraw.Draw(image)
        draw.text((8, 5), "AUTHORING PREVIEW / NOT APP CAPTURE", fill="#253045")
        draw.text((8, 20), f"{title} | tick {tick:02d} / source {frame_id}", fill="#253045")
        rgb_frames.append(image)
    pool = np.concatenate([np.asarray(im).reshape((-1, 3))[::4] for im in rgb_frames])
    colors = shared_palette(pool, 256)
    palette_image = Image.new("P", (1, 1))
    palette_image.putpalette([channel for color in colors for channel in color])
    encoded = [im.quantize(palette=palette_image, dither=Image.Dither.NONE) for im in rgb_frames]
    encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=durations,
                    loop=0, optimize=False, disposal=2)
    with Image.open(path) as gif:
        stored_frames = gif.n_frames
        actual_durations = []
        for i in range(stored_frames):
            gif.seek(i)
            actual_durations.append(gif.info["duration"])
    assert stored_frames == len(schedule), "Tick labels must preserve duplicate timeline positions in GIF"
    assert durations == actual_durations
    return {
        "file": path.name,
        "sha256": SHA(path.read_bytes()),
        "kind": "offline-authoring-preview-not-app-capture",
        "displayScale": 2,
        "storedFrames": stored_frames,
        "durationsMs": durations,
        "sourceFps": fps,
        "exactSourceDurationMs": len(schedule) * 1000 / fps,
        "gifDurationMs": sum(durations),
        "timing": "Cumulative round-half-up to GIF centiseconds; exact source timing is in animations.",
        "transparency": "Composited checkerboard; GIF is not alpha evidence.",
        "palette": "One fixed 256-color preview palette, no dither; authoritative sprite palette is separate.",
    }


def atlas(frames: dict[int, Image.Image]) -> tuple[Image.Image, list[dict]]:
    ids = sorted(frames)
    columns = 8
    image = Image.new("RGBA", (NATIVE[0] * columns, NATIVE[1] * math.ceil(len(ids) / columns)))
    cells = []
    for index, frame_id in enumerate(ids):
        x, y = (index % columns) * NATIVE[0], (index // columns) * NATIVE[1]
        image.paste(frames[frame_id], (x, y))
        cells.append({"id": frame_id, "x": x, "y": y, "width": NATIVE[0], "height": NATIVE[1], "page": 0})
    return image, cells


def comparison_sheet(character: str, action: str, schedule: list[int], reference: dict[int, Image.Image], candidates: dict, scale: int) -> Image.Image:
    ticks = [round(i * (len(schedule) - 1) / 3) for i in range(4)]
    labels = ["Source fixed /4 projection", "Detail /4, shared128", "Compact /8, shared64, 2x nearest"]
    rows = [reference, candidates["detail-128"][character], candidates["compact-64"][character]]
    tw, th = NATIVE[0] * scale + 8, NATIVE[1] * scale + 40
    image = Image.new("RGB", (tw * 4, th * 3 + 34), "#f7f8fa")
    draw = ImageDraw.Draw(image)
    draw.text((8, 9), f"{character} BASE {action} / fixed full canvas / {scale}x pixels / AUTHORING DIAGNOSTIC", fill="#253045")
    for row_index, frames in enumerate(rows):
        for col, tick in enumerate(ticks):
            frame_id = schedule[tick]
            x, y = col * tw + 4, row_index * th + 34
            draw.text((x, y), labels[row_index], fill="#253045")
            draw.text((x, y + 13), f"tick {tick:02d} / source {frame_id}", fill="#253045")
            sprite = frames[frame_id].resize((NATIVE[0] * scale, NATIVE[1] * scale), Image.Resampling.NEAREST)
            bg = checker(sprite.size, 8 * scale).convert("RGBA")
            bg.alpha_composite(sprite)
            image.paste(bg.convert("RGB"), (x, y + 30))
    return image


def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    source_metadata, sources, projections, training_parts = {}, {}, {}, []
    for character, actions in SCOPE.items():
        source = Source(character)
        manifest = source.manifest
        animations = {action: manifest["animations"][action] for action in actions}
        ids = sorted({frame_id for clip in animations.values() for frame_id in clip["frames"]})
        assert all(clip["fps"] == 24 for clip in animations.values())
        assert all((source.cells[f]["width"], source.cells[f]["height"]) == (704, 1056) for f in ids)
        assert manifest["anchor"]["x"] % 4 == 0 and (manifest["anchor"]["y"] + 2) % 4 == 0
        source_metadata[character] = {
            "file": relative(source.path), "sha256": source.sha,
            "manifestSha256": source.manifest_sha, "characterId": source.recipe["characterId"],
            "sourceFrame": [704, 1056], "sourceAnchor": manifest["anchor"],
            "mappedAnchor": {"x": int(manifest["anchor"]["x"] / 4), "y": int((manifest["anchor"]["y"] + 2) / 4),
                             "units": "pixels", "origin": "top-left"},
            "animations": animations, "primaryAction": PRIMARY[character],
            "auxiliaryActions": [a for a in actions if a != PRIMARY[character]],
            "uniqueSourceIds": ids,
            "sourceCells": [source.cells[f] for f in ids],
            "nativePixelSha256": {},
        }
        projections[character] = {4: {}, 8: {}}
        for frame_id in ids:
            original = source.frame(frame_id)
            source_metadata[character]["nativePixelSha256"][str(frame_id)] = SHA(original.tobytes())
            padded = pad_source(original)
            for divisor in (4, 8):
                projections[character][divisor][frame_id] = box_projection(padded, divisor)
        sources[character] = projections[character][4]
        for action in actions:
            for frame_id in animations[action]["frames"]:
                rgba = np.asarray(projections[character][4][frame_id])
                # Ignore near-transparent RGB only while fitting the palette.
                # Output alpha itself is preserved without thresholding.
                training_parts.append(rgba[:, :, :3][rgba[:, :, 3] >= 128])
        source.close()
    training = np.concatenate(training_parts)
    palette_metadata, candidates, variants_metadata = {}, {}, {}
    for variant in VARIANTS:
        variant_id = variant["id"]
        colors = shared_palette(training, variant["paletteSize"])
        palette_metadata[variant_id] = {
            "format": "fixed-rgb-palette", "variant": variant_id, "colors": colors,
            "colorCount": len(colors), "sharedAcross": list(SCOPE),
            "trainingPixelCount": len(training), "trainingRgbSha256": SHA(training.tobytes()),
            "training": "All scoped animation ticks, male then female, idle/walk/run as available; repeated holds weighted by timeline duration. Fixed /4 projection pixels with alpha >=128. No sampling or randomness.",
            "algorithm": "Pillow MEDIANCUT once per variant, no dither; exact nearest squared encoded-sRGB distance, first palette-index tie wins.",
        }
        dump(output / "palettes" / f"{variant_id}.json", palette_metadata[variant_id])
        swatches = Image.new("RGB", (16 * 16, math.ceil(len(colors) / 16) * 16))
        draw = ImageDraw.Draw(swatches)
        for index, color in enumerate(colors):
            x, y = (index % 16) * 16, (index // 16) * 16
            draw.rectangle((x, y, x + 15, y + 15), fill=tuple(color))
        save_png(output / "palettes" / f"{variant_id}.png", swatches)
        candidates[variant_id] = {}
        variants_metadata[variant_id] = {}
        for character, actions in SCOPE.items():
            folder = output / "variants" / variant_id / character
            folder.mkdir(parents=True, exist_ok=True)
            processed, frame_stats = {}, []
            for frame_id, projection in projections[character][variant["sourceDivisor"]].items():
                quantized = apply_palette(projection, colors)
                unquantized = projection
                if variant["nearestExpansion"] == 2:
                    quantized = quantized.resize(NATIVE, Image.Resampling.NEAREST)
                    unquantized = unquantized.resize(NATIVE, Image.Resampling.NEAREST)
                assert quantized.size == NATIVE
                comparison = compare_alpha(quantized, unquantized)
                assert comparison["alphaBytesEqual"]
                processed[frame_id] = quantized
                frame_stats.append({"sourceFrameId": frame_id, **alpha_summary(quantized),
                                    "versusOwnFixedProjection": comparison,
                                    "versusQuarterSourceProjection": compare_alpha(quantized, sources[character][frame_id])})
            candidates[variant_id][character] = processed
            sheet, cells = atlas(processed)
            atlas_sha = save_png(folder / "atlas.png", sheet)
            clip_stats = {}
            previews = {}
            for action in actions:
                clip = source_metadata[character]["animations"][action]
                schedule = clip["frames"]
                unique_ids = sorted(set(schedule))
                source_unique = len({source_metadata[character]["nativePixelSha256"][str(f)] for f in unique_ids})
                projected_unique = len({SHA(sources[character][f].tobytes()) for f in unique_ids})
                output_unique = len({SHA(processed[f].tobytes()) for f in unique_ids})
                assert output_unique == source_unique, f"Unexpected pose collapse: {variant_id}/{character}/{action}"
                clip_stats[action] = {
                    "timelineTicks": len(schedule), "uniqueSourceIds": len(unique_ids),
                    "uniqueNativeSourceRgbaPoses": source_unique,
                    "uniqueQuarterProjectionRgbaPoses": projected_unique,
                    "uniqueOutputRgbaPoses": output_unique,
                    "uniqueOutputAlphaSilhouettes": len({SHA(processed[f].getchannel("A").tobytes()) for f in unique_ids}),
                    "sourceFps": clip["fps"], "durationMs": len(schedule) * 1000 / clip["fps"],
                    "sourceFrameIds": schedule,
                }
                if action == PRIMARY[character]:
                    for scale in (1, 2):
                        save_png(folder / f"{action}.contact-{scale}x.png", contact_sheet(
                            processed, schedule, scale, f"{character} BASE {action} / {variant_id} / {scale}x / native source timeline"
                        ))
                    previews[action] = authoring_gif(folder / f"{action}.authoring.gif", processed, schedule, clip["fps"], f"{character} {action} {variant_id}")
            metadata = {
                "format": "kling-source-pixel-study-atlas", "version": 1,
                "character": character, "variant": variant_id,
                "sourceSha256": source_metadata[character]["sha256"],
                "sourceCharacterId": source_metadata[character]["characterId"],
                "spritesheet": {"file": "atlas.png", "width": sheet.width, "height": sheet.height,
                                "frameWidth": NATIVE[0], "frameHeight": NATIVE[1], "columns": 8,
                                "rows": sheet.height // NATIVE[1], "sha256": atlas_sha},
                "frames": cells, "anchor": source_metadata[character]["mappedAnchor"],
                "animations": source_metadata[character]["animations"],
                "primaryAction": PRIMARY[character],
                "auxiliaryActions": source_metadata[character]["auxiliaryActions"],
                "parameters": variant, "paletteFile": f"../../../palettes/{variant_id}.json",
                "paletteSha256": SHA((output / "palettes" / f"{variant_id}.json").read_bytes()),
                "clipStatistics": clip_stats, "frameStatistics": frame_stats,
                "authoringPreviews": previews,
            }
            dump(folder / "atlas.json", metadata)
            variants_metadata[variant_id][character] = {
                "atlas": str((folder / "atlas.png").relative_to(output)),
                "metadata": str((folder / "atlas.json").relative_to(output)),
                "atlasSha256": atlas_sha, "clipStatistics": clip_stats,
                "minimumSilhouetteIoUVersusQuarterProjection": min(f["versusQuarterSourceProjection"]["silhouetteIoUAt128"] for f in frame_stats),
                "minimumSoftAlphaIoUVersusQuarterProjection": min(f["versusQuarterSourceProjection"]["softAlphaIoU"] for f in frame_stats),
                "allAlphasMatchOwnFixedProjection": all(f["versusOwnFixedProjection"]["alphaBytesEqual"] for f in frame_stats),
            }
            print(f"{variant_id}/{character}: {len(processed)} source cells; {clip_stats[PRIMARY[character]]['timelineTicks']} primary ticks", flush=True)
    for character in SCOPE:
        action = PRIMARY[character]
        schedule = source_metadata[character]["animations"][action]["frames"]
        sheet, cells = atlas(sources[character])
        save_png(output / "references" / f"{character}.quarter-projection.png", sheet)
        dump(output / "references" / f"{character}.quarter-projection.json", {
            "kind": "unquantized-fixed-quarter-projection-not-a-third-candidate", "frames": cells,
            "anchor": source_metadata[character]["mappedAnchor"], "animations": source_metadata[character]["animations"],
        })
        for scale in (1, 2):
            save_png(output / "diagnostics" / f"{character}-{action}.comparison-{scale}x.png",
                     comparison_sheet(character, action, schedule, sources[character], candidates, scale))
    metadata = {
        "format": "kling-source-pixel-study", "version": 1,
        "status": "bounded offline study; no application default change",
        "sourceBaseline": "Current approved docs/kling-motion exports; existing holds are retained exactly.",
        "primaryScope": {"male": "BASE run", "female": "BASE walk"},
        "auxiliaryScope": "Original full idle clips for both plus male walk, solely to support CharacterPack idle/walk requirements.",
        "sources": source_metadata, "variants": variants_metadata,
        "parameters": {
            "nativeCanvas": list(NATIVE), "sourceCanvas": [704, 1056], "paddedSourceCanvas": [704, 1064],
            "universalSourcePadding": SOURCE_PADDING, "commonScale": [1, 4], "offset": [0, 0.5],
            "bodyMapping": "(x,y) -> (x/4,(y+2)/4); original content extent176x264 within176x266 canvas; anchor(352,998)->(88,250)",
            "variants": list(VARIANTS),
            "boxMethod": "Exact integer-grid premultiplied-alpha BOX in encoded sRGB. Alpha rounded half up from box mean; RGB rounded half up from alpha-weighted encoded-sRGB mean. Zero-alpha RGB=0.",
            "alpha": "All projected 8-bit alpha levels retained; no alpha threshold, dither, shadow cleanup, or outline alteration. Compact projected cells expanded with NEAREST2x.",
            "palette": "One deterministic median-cut palette per variant shared across both complete scoped timeline banks; no per-frame palette or dither. Exact nearest squared encoded-sRGB assignment.",
            "geometry": "Fixed full-frame aspect-preserving projection. No per-frame crop, scale, recenter, head locking, interpolation, warping, or AI redraw.",
            "timing": "Exact source IDs, held repeats, order, 24fps and loop flags. GIF centisecond timing is approximate and explicitly labeled.",
        },
        "toolchain": {"python": platform.python_version(), "pillow": PILLOW_VERSION, "numpy": np.__version__,
                      "script": relative(Path(__file__).resolve()), "scriptSha256": SHA(Path(__file__).read_bytes())},
        "verification": {
            "alphaMatchesOwnProjection": True, "noUniqueRgbaPoseLoss": True,
            "inputsUnchanged": all(SHA((ROOT / s["file"]).read_bytes()) == s["sha256"] for s in source_metadata.values()),
            "gifFramesEqualTimelineTicks": True,
            "caveat": "Alpha equality against a variant's own projection does not mean source-resolution geometry is lossless. Per-frame quarter-projection comparisons measure coarse-grid loss. Source blur and motion inconsistencies remain.",
        },
    }
    assert metadata["verification"]["inputsUnchanged"]
    dump(output / "study.json", metadata)
    index = {"format": "kling-source-pixel-study-index", "version": 1, "variants": {}}
    for variant in VARIANTS:
        variant_id = variant["id"]
        index["variants"][variant_id] = {}
        for character in SCOPE:
            folder = output / "variants" / variant_id / character
            item = json.loads((folder / "atlas.json").read_text())
            index["variants"][variant_id][character] = {
                "atlas": str((folder / "atlas.png").relative_to(output)),
                "metadata": str((folder / "atlas.json").relative_to(output)),
                "atlasSha256": item["spritesheet"]["sha256"],
                "frameWidth": NATIVE[0], "frameHeight": NATIVE[1],
                "spritesheet": item["spritesheet"], "frames": item["frames"],
                "animations": item["animations"], "anchor": item["anchor"],
                "sourceCharacterId": item["sourceCharacterId"], "sourceSha256": item["sourceSha256"],
                "palette": f"palettes/{variant_id}.json", "paletteSha256": item["paletteSha256"],
            }
    dump(output / "index.json", index)
    (output / "README.md").write_text(
        "# Kling source pixel study\n\n"
        "Two bounded offline candidates process the approved Kling anatomy and complete native schedules. "
        "They are not redrawn characters. The primary samples are male BASE run (16 ticks / 16 drawings at24fps) "
        "and female BASE walk (27 ticks / 25 drawings at 24 fps, preserving held source 28 and 41). "
        "Original full idle clips and male walk are auxiliary packaging context. No default catalog or previous asset is changed.\n\n"
        "- **detail-128:** fixed padded 704x1064 canvas to 176x266 via premultiplied-alpha 4x4 BOX, shared 128-color palette.\n"
        "- **compact-64:** fixed padded 704x1064 to 88x133 via premultiplied-alpha 8x8 BOX, shared 64-color palette, exact nearest 2x expansion to 176x266.\n\n"
        "Every 704x1056 source frame receives the same transparent padding: top 2, bottom 6, left/right 0 pixels. "
        "No original pixels are cropped. Body mapping is (x/4,(y+2)/4), preserving the exact aspect ratio and mapping source anchor (352,998) "
        "to integer (88,250) without rounding, shifting individual poses, or distorting either grid. The original content extent 176x264 sits within 176x266. "
        "BOX works in encoded sRGB using integer sums and round-half-up; "
        "all projected alpha levels remain intact. Each palette is learned once from the entire scoped timeline bank across both characters "
        "(source holds weighted by their duration), then assigned by exact nearest RGB distance without dithering. "
        "There is no per-frame crop-fit, head locking, temporal interpolation, new shadow removal, or AI regeneration.\n\n"
        "`study.json` records parameters, tool versions, input SHA256, source IDs/cells, native animations and summary checks. "
        "`palettes/*.json` records every palette RGB entry and the deterministic training-pool hash. "
        "`variants/<variant>/<character>/atlas.json` maps source IDs to transparent PNG atlas cells and records per-frame alpha/silhouette diagnostics. "
        "Alpha is byte-identical to each candidate's unquantized fixed projection; the separate comparison against the quarter projection exposes coarse-grid silhouette loss.\n\n"
        "Contact sheets show every primary timeline tick at native 1x and nearest 2x. Comparison sheets show four phases against the unquantized quarter projection. "
        "The reference projection is diagnostic, not a third candidate. GIFs are explicitly labeled **AUTHORING PREVIEW / NOT APP CAPTURE**, "
        "composited over checkerboard, and use centisecond-rounded timing because GIF cannot represent exact 24 fps. "
        "The atlas metadata retains the exact 24 fps schedule and is authoritative for app packaging and alpha. "
        "Source blur, original pose changes and existing holds remain; palette consistency cannot repair source motion.\n\n"
        "Regenerate from the repository root:\n\n"
        "```sh\n/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-study.py\n```\n\n"
        "Use `--output /tmp/kling-source-pixel-recheck` for an isolated deterministic rerun. Python/Pillow/NumPy versions are recorded in `study.json`.\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build(args.output.resolve())
