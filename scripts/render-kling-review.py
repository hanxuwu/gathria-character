"""Render review media ONLY from the actual player-exported CharacterPacks.

Native PNG comparisons retain source dimensions; GIFs are explicitly 0.5x,
palette-quantized review copies. They never replace delivered RGBA source art.
"""
from pathlib import Path
import hashlib
import io
import json
import math
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/kling-playback"
OUT = BASE / "review"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / "artwork/kling-playback/prepared"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
ACTIONS = ["idle", "walk", "run", "celebrate"]
report = {"source": "Actual existing-player exported CharacterPack atlases",
          "gifNote": "0.5x display copies, 256-color palette; 24fps timing rounded to GIF centiseconds. PNG/ZIP is native fidelity reference.",
          "packs": {}, "animations": [], "media": []}
report["finalBrowserEvidenceSha256"] = hashlib.sha256((BASE / "browser/evidence-index.json").read_bytes()).hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font(size=18):
    return ImageFont.truetype(FONT, size)


def checker(size, dark=False):
    a, b = ("#242832", "#303540") if dark else ("#f5f3ed", "#e9e7e1")
    im = Image.new("RGB", size, a)
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], 32):
        for x in range(0, size[0], 32):
            if (x // 32 + y // 32) % 2:
                d.rectangle((x, y, x + 31, y + 31), fill=b)
    return im


def panel(images, labels, zoom=1, dark=False):
    width = sum(im.width for im in images) * zoom
    height = max(im.height for im in images) * zoom
    result = checker((width, height + 48), dark)
    d = ImageDraw.Draw(result)
    d.rectangle((0, 0, width, 47), fill="#f5f3ed")
    x = 0
    for im, label in zip(images, labels):
        display = im.resize((im.width * zoom, im.height * zoom), Image.Resampling.NEAREST)
        result.paste(display, (x, 48), display if display.mode == "RGBA" else None)
        d.text((x + 12, 12), label, font=font(), fill="#31383e")
        x += display.width
    return result


def load_pack(identity):
    path = BASE / "exports" / f"{identity}.character.zip"
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        manifest = json.loads(z.read("manifest.json"))
        recipe = json.loads(z.read("character.json"))
        atlas = Image.open(io.BytesIO(z.read("spritesheet.png"))).convert("RGBA")
        atlas.load()
        assert manifest["schemaVersion"] == 2
        frames = {v["id"]: atlas.crop((v["x"], v["y"], v["x"] + v["width"], v["y"] + v["height"])) for v in manifest["frames"]}
    report["packs"][identity] = {"path": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()),
        "atlas": atlas.size, "frameSize": [manifest["spritesheet"]["frameWidth"], manifest["spritesheet"]["frameHeight"]],
        "uniqueFrames": len(frames), "crcAndPngDecode": True}
    return manifest, recipe, frames


packs = {who: load_pack(who) for who in ["male", "female"]}
source_zip = zipfile.ZipFile(SOURCE / "kling-source.zip")


def clip(identity, action):
    manifest, recipe, frames = packs[identity]
    definition = manifest["animations"][action]
    return [frames[i] for i in definition["frames"]], definition["fps"], recipe["sourceMetadata"]["actions"][action]["frames"]


def save_gif(name, identities, action, facing="right"):
    all_frames = [clip(who, action) for who in identities]
    count = len(all_frames[0][0])
    fps = all_frames[0][1]
    assert all(len(v[0]) == count and v[1] == fps for v in all_frames)
    images = []
    for index in range(count):
        result = checker((352 * len(identities), 560))
        d = ImageDraw.Draw(result)
        d.rectangle((0, 0, result.width, 47), fill="#f5f3ed")
        for col, who in enumerate(identities):
            frame = all_frames[col][0][index]
            if facing == "left":
                frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            frame = frame.resize((352, 512), Image.Resampling.LANCZOS)
            result.paste(frame, (352 * col, 48), frame)
            d.text((352 * col + 9, 6), f"{who} / {action} / {facing} / 0.5x", font=font(15), fill="#31383e")
            source_frame = all_frames[col][2][index]["sourceFrame"]
            d.text((352 * col + 9, 26), f"In place | {index + 1:02d}/{count} | source {source_frame}", font=font(13), fill="#59616a")
        images.append(result)
    # A shared palette avoids per-frame color-palette shimmer. Native PNGs are
    # unquantized; this display-only GIF conversion is explicitly labeled.
    palette_sheet = Image.new("RGB", (176 * len(identities), 280 * count))
    for i, im in enumerate(images):
        palette_sheet.paste(im.resize((176 * len(identities), 280)), (0, i * 280))
    palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    converted = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    duration = [round((i + 1) * 100 / fps) * 10 - round(i * 100 / fps) * 10 for i in range(count)]
    path = OUT / f"{name}.gif"
    converted[0].save(path, save_all=True, append_images=converted[1:], duration=duration,
                      loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        assert gif.n_frames == count and gif.info["loop"] == 0
        decoded_durations = []
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.convert("RGB").load()
            decoded_durations.append(gif.info["duration"])
        assert decoded_durations == duration
    report["animations"].append({"path": str(path.relative_to(ROOT)), "frames": count,
        "nativeFps": fps, "nativeDurationMs": count * 1000 / fps, "gifDurationsMs": duration,
        "gifDurationMs": sum(duration), "loop": True, "facing": facing})


for action in ACTIONS:
    for who in packs:
        save_gif(f"{who}_{action}", [who], action)
        frames, fps, refs = clip(who, action)
        # Every frame, native dimensions. Compact overview additionally labeled
        # 0.25x avoids claiming a reduced contact sheet is the native source.
        for scale, suffix in [(1, "1x"), (.25, "overview")]:
            fw, fh = round(frames[0].width * scale), round(frames[0].height * scale)
            columns = 4 if scale == 1 else 8
            result = checker((fw * columns, (fh + 32) * math.ceil(len(frames) / columns)))
            d = ImageDraw.Draw(result)
            for i, im in enumerate(frames):
                x, y = i % columns * fw, i // columns * (fh + 32)
                d.rectangle((x, y, x + fw - 1, y + 31), fill="#f5f3ed")
                display = im if scale == 1 else im.resize((fw, fh), Image.Resampling.LANCZOS)
                result.paste(display, (x, y + 32), display)
                d.text((x + 6, y + 5), f"{who} {action} {i:02d} | src {refs[i]['sourceFrame']}", font=font(18 if scale == 1 else 11), fill="#31383e")
            result.save(OUT / f"{who}_{action}_frames_{suffix}.png")
    save_gif(f"pair_{action}", ["male", "female"], action)
for who in packs:
    save_gif(f"{who}_run_left", [who], "run", "left")

for who in packs:
    manifest, recipe, frames = packs[who]
    standing_id = next(f["frameId"] for f in recipe["derivation"]["frames"] if f["sourceFrame"] == 348)
    exported = frames[standing_id]
    source = Image.open(SOURCE / f"{who}-source-standing.png").convert("RGB")
    prepared = Image.open(io.BytesIO(source_zip.read(f"characters/{who}/layers/body_composite/idle_loop/012.png"))).convert("RGBA")
    assert np.array_equal(np.array(prepared), np.array(exported)), "Standing atlas/source mismatch"
    panel([source, prepared, exported], ["Original video RGB / native 1x", "Derived matte RGBA / native 1x", "Actual exported atlas / native 1x"]).save(OUT / f"{who}_source_matte_export_1x.png")
    for dark in [False, True]:
        panel([exported], [f"{who} native export / {'dark' if dark else 'light'}"], dark=dark).save(OUT / f"{who}_standing_{'dark' if dark else 'light'}_1x.png")
    head = (140, 100, 570, 550)
    panel([source.crop(head), exported.crop(head)], ["Video face/neck / 2x integer zoom", "Export face/neck / 2x integer zoom"], zoom=2).save(OUT / f"{who}_face_neck_2x.png")
    # Actual two-frame loop boundary, same canvas and size; no alignment edits.
    for action in ACTIONS:
        motion, fps, refs = clip(who, action)
        panel([motion[-1], motion[0]], [f"{action}: last / source {refs[-1]['sourceFrame']}", f"{action}: first / source {refs[0]['sourceFrame']}"]).save(OUT / f"{who}_{action}_boundary_1x.png")

for path in sorted(OUT.glob("*")):
    with Image.open(path) as image:
        size = image.size
        for i in range(getattr(image, "n_frames", 1)):
            image.seek(i)
            image.load()
        assert size[0] > 0 and size[1] > 0
    report["media"].append({"path": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()),
                             "bytes": path.stat().st_size, "size": size, "decoded": True})
additional = []
for path in sorted((BASE / "browser").glob("*.png")) + sorted(SOURCE.glob("*.png")):
    with Image.open(path) as image:
        image.load()
        assert image.getbbox() and min(image.size) > 0
        additional.append({"path": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "size": image.size, "decoded": True})
assert source_zip.testzip() is None
source_pngs = [p for p in source_zip.namelist() if p.endswith(".png")]
for path in source_pngs:
    with Image.open(io.BytesIO(source_zip.read(path))) as image:
        image.load()
        assert image.mode == "RGBA" and image.size == (704, 1024) and image.getbbox()
        alpha = np.array(image)[:, :, 3]
        assert np.any(alpha == 0) and np.any(alpha == 255) and np.any((alpha > 0) & (alpha < 255))
report["additionalPngChecks"] = additional
report["sourceArchive"] = {"sha256": sha((SOURCE / "kling-source.zip").read_bytes()), "crcPassed": True, "decodedNativeRgbaFrames": len(source_pngs)}
(BASE / "artifact-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Decoded {len(report['media'])} review files including {len(report['animations'])} GIF sequences, {len(additional)} additional PNGs and {len(source_pngs)} source RGBA frames; all three ZIPs valid.")
