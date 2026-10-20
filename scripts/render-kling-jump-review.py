"""Decode actual UI-exported Kling jump packs and render bounded review evidence.

No source artwork is generated or changed. Native PNGs are fidelity references;
GIFs are 0.5x, palette-quantized, one-shot display copies with centisecond timing.
Run only after scripts/generate-kling-jump-evidence.mjs has exported both packs.
"""
from pathlib import Path
import hashlib
import io
import json
import math
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/kling-jump"
OUT = BASE / "review"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / "artwork/kling-jump/prepared/kling-source.zip"
LEGACY = ROOT / "artwork/kling-playback/prepared/kling-source.zip"
RECIPE = json.loads((ROOT / "artwork/kling-jump/source/selection.json").read_text())
ACTIONS = ["idle", "walk", "run", "celebrate", "jump"]
KEYS = [171, 175, 184, 190, 194, 209]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
report = {
    "source": "Actual existing-player UI-exported native CharacterPack V3 atlases",
    "gifNote": "0.5x display copies on checker; 256 colors, original24fps rounded to GIF10ms units. One-shot GIFs omit the repeat extension. Native RGBA PNG/ZIP retains source fidelity.",
    "limitations": ["Original videos clip a small scalp arc at apex source frames183–186. These source pixels are retained without reconstructing missing artwork.", "Uniform32px transparent top padding changes canvas and anchor only; historical source RGBA is unchanged below padding."],
    "packs": {}, "animations": [], "media": [], "fidelity": [],
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font(size=18):
    return ImageFont.truetype(FONT, size)


def checker(size):
    result = Image.new("RGB", size, "#f5f3ed")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 32):
        for x in range(0, size[0], 32):
            if (x // 32 + y // 32) % 2:
                draw.rectangle((x, y, x + 31, y + 31), fill="#e9e7e1")
    return result


def key(action):
    return action + ("_once" if action == "jump" else "_loop")


def read_png(archive, path):
    result = Image.open(io.BytesIO(archive.read(path))).convert("RGBA")
    result.load()
    return result


def load_and_verify(identity, source, legacy):
    path = BASE / "exports" / f"{identity}.character.zip"
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, "ZIP checksum mismatch"
        manifest = json.loads(archive.read("manifest.json"))
        recipe = json.loads(archive.read("character.json"))
        assert manifest["schemaVersion"] == 3
        assert manifest["anchor"] == {"x": 352, "y": 998, "units": "pixels", "origin": "top-left"}
        sheets = [manifest["spritesheet"], *manifest["additionalSheets"]]
        assert set(archive.namelist()) == {"manifest.json", "character.json", "PROVENANCE.txt", "INTEGRATION.md", *[sheet["file"] for sheet in sheets]}
        frame_defs = {frame["id"]: frame for frame in manifest["frames"]}
        references = {}
        for action in ACTIONS:
            config = json.loads(source.read(f"characters/{identity}/actions/{key(action)}.json"))
            clip = manifest["animations"][action]
            assert len(clip["frames"]) == len(config["frames"])
            assert clip["fps"] == config["fps"] == 24
            assert clip["loop"] == (action != "jump")
            for position, frame in enumerate(config["frames"]):
                frame_id = clip["frames"][position]
                references.setdefault(frame_id, []).append((action, position, frame))
        jump = {}
        exact = 0
        historical = 0
        alpha_checked = 0
        for page, sheet in enumerate(sheets):
            atlas = read_png(archive, sheet["file"])
            assert atlas.size == (sheet["width"], sheet["height"])
            assert max(atlas.size) <= 8192
            for frame_id, locations in references.items():
                frame = frame_defs[frame_id]
                if frame["page"] != page:
                    continue
                assert (frame["width"], frame["height"]) == (704, 1056)
                exported = atlas.crop((frame["x"], frame["y"], frame["x"] + frame["width"], frame["y"] + frame["height"]))
                pixels = np.array(exported)
                alpha = pixels[:, :, 3]
                assert np.any(alpha == 0) and np.any(alpha == 255)
                assert not np.any(alpha[0]) and not np.any(alpha[-1])
                assert not np.any(alpha[:, 0]) and not np.any(alpha[:, -1])
                alpha_checked += 1
                for action, position, ref in locations:
                    source_path = f"characters/{identity}/{ref['image']}"
                    prepared = read_png(source, source_path)
                    assert prepared.size == exported.size
                    assert np.array_equal(pixels, np.array(prepared)), f"Source pixel mismatch: {identity}/{action}/{position}"
                    exact += 1
                    if action != "jump":
                        old = read_png(legacy, source_path)
                        assert not np.any(pixels[:32]), "Historical top padding is not empty"
                        assert np.array_equal(pixels[32:], np.array(old)), f"Historical pixels changed: {source_path}"
                        historical += 1
                    else:
                        assert ref["source_video_frame"] == 171 + position
                        jump[position] = exported.copy()
                exported.close()
            atlas.close()
        assert exact == 122 and historical == 83 and len(jump) == 39
    report["packs"][identity] = {"path": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
        "schemaVersion": 3, "sheets": [{"file": sheet["file"], "size": [sheet["width"], sheet["height"]]} for sheet in sheets],
        "frameSize": [704, 1056], "crcAndPngDecode": True}
    report["fidelity"].append({"character": identity, "sourceFramesExactRgba": exact,
        "historicalFramesExactAfterRemovingTop32": historical, "transparentFrameBoundariesChecked": alpha_checked,
        "jumpSourceFrames": [171, 209], "jumpFps": 24, "jumpFrames": 39, "jumpLoop": False})
    return manifest, recipe, [jump[i] for i in range(39)]


def save_gif(name, identities, packs, facing="right"):
    frames = []
    for index in range(39):
        result = checker((352 * len(identities), 576))
        draw = ImageDraw.Draw(result)
        draw.rectangle((0, 0, result.width, 47), fill="#f5f3ed")
        for col, who in enumerate(identities):
            image = packs[who][2][index]
            if facing == "left":
                image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            image = image.resize((352, 528), Image.Resampling.LANCZOS)
            result.paste(image, (352 * col, 48), image)
            draw.text((352 * col + 8, 5), f"{who} / jump / {facing} / 0.5x", font=font(14), fill="#31383e")
            draw.text((352 * col + 8, 25), f"One shot | {index + 1:02d}/39 | source {171 + index}", font=font(13), fill="#59616a")
        frames.append(result)
    palette_sheet = Image.new("RGB", (176 * len(identities), 288 * len(frames)))
    for index, image in enumerate(frames):
        palette_sheet.paste(image.resize((176 * len(identities), 288)), (0, index * 288))
    palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    converted = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in frames]
    durations = [round((i + 1) * 100 / 24) * 10 - round(i * 100 / 24) * 10 for i in range(39)]
    path = OUT / f"{name}.gif"
    # No loop argument: one-shot previews must not restart as if jump were cyclic.
    converted[0].save(path, save_all=True, append_images=converted[1:], duration=durations, disposal=2, optimize=False)
    with Image.open(path) as gif:
        assert gif.n_frames == 39 and "loop" not in gif.info
        actual = []
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.convert("RGB").load()
            actual.append(gif.info["duration"])
        assert actual == durations and abs(sum(actual) - 1625) <= 5
    report["animations"].append({"path": str(path.relative_to(ROOT)), "frames": 39, "facing": facing,
        "nativeFps": 24, "nativeDurationMs": 1625, "gifDurationMs": sum(durations), "gifDurationsMs": durations, "loop": False})


def key_sheet(identity, frames, zoom):
    width, height = 704 * zoom, 1056 * zoom
    label_height = 44
    result = checker((width * 3, (height + label_height) * 2))
    draw = ImageDraw.Draw(result)
    for i, source_frame in enumerate(KEYS):
        x, y = i % 3 * width, i // 3 * (height + label_height)
        image = frames[source_frame - 171]
        if zoom != 1:
            image = image.resize((width, height), Image.Resampling.NEAREST)
        result.paste(image, (x, y + label_height), image)
        draw.rectangle((x, y, x + width - 1, y + label_height - 1), fill="#f5f3ed")
        draw.text((x + 10, y + 10), f"{identity} | source {source_frame} | native {zoom}x", font=font(18), fill="#31383e")
    result.save(OUT / f"{identity}_jump_keyframes_{zoom}x.png")


def source_comparison(identity, exported, source):
    item = RECIPE["characters"][identity]
    png = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(ROOT / item["video"]),
        "-vf", "select=eq(n\\,184)", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-pix_fmt", "rgb24", "-"])
    original = Image.open(io.BytesIO(png)).convert("RGBA")
    x, y = item["cropOrigin"]
    raw = original.crop((x, y, x + 704, y + 1056))
    prepared = read_png(source, f"characters/{identity}/layers/body_composite/jump_once/013.png")
    assert np.array_equal(np.array(prepared), np.array(exported))
    result = checker((704 * 3, 1056 + 64))
    draw = ImageDraw.Draw(result)
    labels = ["Original video RGB / native 1x", "Prepared matte / native 1x", "Actual V3 export / native 1x"]
    for column, (image, label) in enumerate(zip([raw, prepared, exported], labels)):
        result.paste(image, (704 * column, 64), image)
        draw.text((704 * column + 8, 8), label, font=font(18), fill="#31383e")
        draw.text((704 * column + 8, 34), "Source184: original video clips a small scalp arc", font=font(17), fill="#8b4b32")
    result.save(OUT / f"{identity}_apex_source_matte_export_1x.png")


with zipfile.ZipFile(SOURCE) as source, zipfile.ZipFile(LEGACY) as legacy:
    assert source.testzip() is None and legacy.testzip() is None
    report["sourceSha256"] = sha(SOURCE.read_bytes())
    report["legacySourceSha256"] = sha(LEGACY.read_bytes())
    report["browserEvidenceSha256"] = sha((BASE / "browser/evidence-index.json").read_bytes())
    evidence = json.loads((BASE / "browser/evidence-index.json").read_text())
    assert evidence.get("passed") is True, "Browser evidence is incomplete"
    packs = {who: load_and_verify(who, source, legacy) for who in ["male", "female"]}
    for who in packs:
        save_gif(f"{who}_jump_right", [who], packs)
        save_gif(f"{who}_jump_left", [who], packs, "left")
        for zoom in [1, 2]:
            key_sheet(who, packs[who][2], zoom)
        source_comparison(who, packs[who][2][13], source)
    save_gif("pair_jump_right", ["male", "female"], packs)

for folder in [OUT, BASE / "browser"]:
    for path in sorted(folder.glob("*")):
        if path.suffix.lower() not in [".png", ".gif"]:
            continue
        with Image.open(path) as image:
            size = image.size
            count = getattr(image, "n_frames", 1)
            for i in range(count):
                image.seek(i)
                image.load()
            assert size[0] > 0 and size[1] > 0 and path.stat().st_size > 0
        report["media"].append({"path": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()),
            "bytes": path.stat().st_size, "size": size, "frames": count, "decoded": True})
report["totals"] = {"exactSourceFrames": sum(row["sourceFramesExactRgba"] for row in report["fidelity"]),
    "unchangedHistoricalFrames": sum(row["historicalFramesExactAfterRemovingTop32"] for row in report["fidelity"]),
    "gifs": len(report["animations"]), "decodedMedia": len(report["media"])}
(BASE / "artifact-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report["totals"]))
