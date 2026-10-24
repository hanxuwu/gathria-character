#!/usr/bin/env python3
"""Independently decode actual theme-workspace downloads; never redraws artwork."""
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get("KLING_THEME_REVIEW_DIR", "docs/kling-themes/evidence")
spec = importlib.util.spec_from_file_location("helpers", ROOT / "scripts/verify-kling-look-workflow.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
sha = lambda data: hashlib.sha256(data).hexdigest()


def verify_theme(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("theme.json"))
        assert manifest["format"] == "gathria-character-theme" and manifest["version"] == 1
        assert set(archive.namelist()) == {"theme.json", *(look["file"] for look in manifest["looks"])}
        for look in manifest["looks"]:
            data = archive.read(look["file"])
            assert sha(data) == look["sha256"]
            helpers.nested_zip(data)
            with zipfile.ZipFile(io.BytesIO(data)) as pack:
                m = json.loads(pack.read("manifest.json"))
                c = json.loads(pack.read("character.json"))
                assert c["characterId"] == manifest["characterId"]
                assert m["scale"]["pixelArt"] == (manifest["rendering"] == "pixel")
        return manifest


def expected_gif(image, pixel, facing):
    image = helpers.matte(image, (238, 233, 223))
    if not pixel:
        image = image.resize((math.ceil(image.width / 2), math.ceil(image.height / 2)), Image.Resampling.BOX)
    return ImageOps.mirror(image) if facing == "left" else image


def check_gif(path, pack, action, facing):
    clip = pack.m["animations"][action]
    pixel = pack.m["scale"]["pixelArt"]
    errors, durations = [], []
    with Image.open(path) as gif:
        assert gif.n_frames == len(clip["frames"]), (path.name, gif.n_frames, len(clip["frames"]))
        assert (gif.info.get("loop") == 0) == clip["loop"]
        for index, frame_id in enumerate(clip["frames"]):
            gif.seek(index)
            gif.load()
            duration = (math.floor((index + 1) * 100 / clip["fps"] + .5) - math.floor(index * 100 / clip["fps"] + .5)) * 10
            assert gif.info["duration"] == duration
            expected = expected_gif(pack.frame(frame_id), pixel, facing)
            actual = gif.convert("RGB")
            assert actual.size == expected.size
            error = float(np.abs(np.asarray(actual, dtype=float) - np.asarray(expected, dtype=float)).mean())
            assert error < 4, (path.name, frame_id, error)
            errors.append(error)
            durations.append(duration)
    return {"file": str(path.relative_to(ROOT)), "frames": len(durations), "durationsMs": durations,
            "loop": clip["loop"], "pixelNativeSize": pixel, "maxMeanPaletteError": max(errors)}


def mirror_gifs(left, right):
    with Image.open(left) as l, Image.open(right) as r:
        assert l.n_frames == r.n_frames and l.size == r.size
        for index in range(l.n_frames):
            l.seek(index)
            r.seek(index)
            assert np.array_equal(np.asarray(l.convert("RGB"))[:, ::-1], np.asarray(r.convert("RGB")))


def compare_themes(reference, pixel, character, look_id, review, font):
    """Presentation only: two actual export banks, shared anchor, explicit display scales.

    Pixel artwork is enlarged by an exact 2x nearest-neighbor scale. Reference
    canvas height is normalized to that display height. The run timeline follows
    reference positions and maps the authored theme by normalized phase; this is
    not interpolation, retargeting, or an alteration to either exported pack.
    """
    target_height = pixel.m["spritesheet"]["frameHeight"] * 2
    reference_scale = target_height / reference.m["spritesheet"]["frameHeight"]
    scales = [reference_scale, 2]
    packs = [reference, pixel]
    sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), target_height)
             for pack, scale in zip(packs, scales)]
    anchors = [(round(pack.m["anchor"]["x"] * scale), round(pack.m["anchor"]["y"] * scale))
               for pack, scale in zip(packs, scales)]
    left = max(anchor[0] for anchor in anchors)
    right = max(size[0] - anchor[0] for size, anchor in zip(sizes, anchors))
    above = max(anchor[1] for anchor in anchors)
    below = max(size[1] - anchor[1] for size, anchor in zip(sizes, anchors))
    width, height, gap, caption = left + right, above + below, 16, 52
    def frame_pair(ref_id, pixel_id):
        board = Image.new("RGBA", (width * 2 + gap, height + caption), (238, 233, 223, 255))
        draw = ImageDraw.Draw(board)
        for index, (pack, frame_id, size, anchor) in enumerate(zip(packs, [ref_id, pixel_id], sizes, anchors)):
            image = pack.frame(frame_id).resize(size, Image.Resampling.NEAREST if index else Image.Resampling.LANCZOS)
            board.alpha_composite(image, (index * (width + gap) + left - anchor[0], caption + above - anchor[1]))
            draw.text((index * (width + gap) + 5, 6), "Pixel artwork - native 2x" if index else "Original - display height normalized", font=font, fill=(40, 60, 53))
            draw.text((index * (width + gap) + 5, 26), f'{character} / {look_id} / own anchor, phase aligned', font=font, fill=(40, 60, 53))
        return board.convert("RGB")
    original_clip, pixel_clip = reference.m["animations"]["run"], pixel.m["animations"]["run"]
    count = len(original_clip["frames"])
    mapping = [min(len(pixel_clip["frames"]) - 1, math.floor(i * len(pixel_clip["frames"]) / count)) for i in range(count)]
    frames = [frame_pair(frame_id, pixel_clip["frames"][mapping[i]]) for i, frame_id in enumerate(original_clip["frames"])]
    sample_width, sample_height = max(1, frames[0].width // 3), max(1, frames[0].height // 3)
    sample = Image.new("RGB", (sample_width, sample_height * len(frames)))
    for index, frame in enumerate(frames):
        sample.paste(frame.resize((sample_width, sample_height), Image.Resampling.BOX), (0, index * sample_height))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    durations = [(math.floor((i + 1) * 100 / original_clip["fps"] + .5) - math.floor(i * 100 / original_clip["fps"] + .5)) * 10 for i in range(count)]
    path = review / f"{character}-{look_id}-run-theme-comparison.gif"
    quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=durations, loop=0, disposal=1, optimize=False)
    with Image.open(path) as gif:
        assert gif.n_frames == count and gif.info.get("loop") == 0
        for index in range(count):
            gif.seek(index); gif.load(); assert gif.info["duration"] == durations[index]
    standing = frame_pair(reference.m["animations"]["idle"]["frames"][0], pixel.m["animations"]["idle"]["frames"][0])
    standing.save(review / f"{character}-{look_id}-standing-theme-comparison.png")
    original_duration = len(original_clip["frames"]) / original_clip["fps"]
    pixel_duration = len(pixel_clip["frames"]) / pixel_clip["fps"]
    return {"file": str(path.relative_to(ROOT)), "referenceDisplayScale": reference_scale,
            "pixelDisplayScale": 2, "sharedPresentationAnchor": {"x": left, "y": caption + above},
            "referenceCycleSeconds": original_duration, "pixelCycleSeconds": pixel_duration,
            "equalNativeCycleDuration": abs(original_duration - pixel_duration) < 1e-10,
            "phaseMapping": [{"referenceFrameId": fid, "pixelFrameId": pixel_clip["frames"][mapping[i]]} for i, fid in enumerate(original_clip["frames"])],
            "derivedFromActualExports": True, "originalNativeExportsUnchanged": True,
            "note": "Presentation comparison follows original run timing; pixel positions map by normalized phase. No new drawings or interpolated frames."}


def verify_final_presentation():
    directory = OUT.parent / "presentation"
    captured_bytes = (directory / "capture.json").read_bytes()
    captured = json.loads(captured_bytes)
    baseline_bytes = (OUT / "capture.json").read_bytes()
    baseline = json.loads(baseline_bytes)
    assert captured["passed"] and len(captured["cases"]) == 4
    assert captured["baselineCaptureSha256"] == sha(baseline_bytes)
    assert captured["baselineCommit"] == baseline["commitAtCapture"]
    assert captured["assetHashes"] == baseline["assetHashes"]
    assert not captured["errors"] and not captured["failedRequests"]
    assert {(case["character"], case["lookId"]) for case in captured["cases"]} == {
        (character, look) for character in ["male", "female"] for look in ["base", "wedding"]}
    for file, expected in captured["sourceHashes"].items():
        assert sha((ROOT / file).read_bytes()) == expected
        historical = subprocess.check_output(["git", "show", f'{captured["commitAtCapture"]}:{file}'], cwd=ROOT)
        assert sha(historical) == expected
    for file, expected in captured["assetHashes"].items():
        assert sha((ROOT / file).read_bytes()) == expected
    cases = []
    for case in captured["cases"]:
        original = ROOT / case["baselinePng"]
        native = ROOT / case["png"]
        assert native.read_bytes() == original.read_bytes()
        assert sha(native.read_bytes()) == case["pngSha256"]
        with Image.open(native) as a, Image.open(original) as b:
            a.load(); b.load()
            assert a.mode == b.mode == "RGBA" and a.size == b.size
            assert a.tobytes() == b.tobytes()
        screenshot = ROOT / case["screenshot"]
        assert sha(screenshot.read_bytes()) == case["screenshotSha256"]
        with Image.open(screenshot) as image:
            image.load(); assert min(image.size) > 0
        pixel, reference = case["geometry"]["theme-preview"], case["geometry"]["theme-reference"]
        for axis, css in [("width", "cssWidth"), ("height", "cssHeight")]:
            assert pixel[css] == pixel[axis] * 2 == reference[axis] == reference[css]
        cases.append({"key": case["key"], "nativePngDecodedAndByteExact": True,
                      "screenshotDecoded": True, "directResolutionReferenceGeometry": True})
    result = {"passed": True, "presentationCaptureSha256": sha(captured_bytes),
              "baselineCommit": baseline["commitAtCapture"], "presentationCommit": captured["commitAtCapture"],
              "currentPresentationSourceMatchesCommit": True, "assetHashesUnchanged": True,
              "changedSources": captured["changedSources"], "cases": cases,
              "note": "Only the separately captured final presentation and four native PNG exports are validated here. The earlier full matrix remains attributed to its original commit."}
    (directory / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"presentationCases": len(cases), "decodedPngs": len(cases) * 2, "passed": True}))


def main():
    evidence = json.loads((OUT / "capture.json").read_text())
    assert evidence["passed"] and evidence["production"]
    assert len(evidence["cases"]) == 8 and len(evidence["playback"]) == 80
    assert {(c["character"], c["themeKey"].split(":")[1], c["lookId"]) for c in evidence["cases"]} == {
        (character, theme, look) for character in ["male", "female"]
        for theme in ["kling-original@1", "pixel-storybook@1"] for look in ["base", "wedding"]}
    assert len(evidence["switches"]) == 4
    for switch in evidence["switches"]:
        assert switch["retainedMotionPhase"] and switch["fromPosition"] > 0
        assert switch["toPosition"] == math.floor(switch["fromPosition"] * switch["toCount"] / switch["fromCount"])
    for field in ["errors", "failedRequests", "externalRequests", "independentEditorRequests"]:
        assert not evidence[field], (field, evidence[field])
    source_revision = os.environ.get("KLING_THEME_SOURCE_REVISION")
    if source_revision:
        assert source_revision == evidence["commitAtCapture"], "Historical verification must name the exact captured commit."
    source_differences = []
    for file, expected in evidence["sourceHashes"].items():
        current = sha((ROOT / file).read_bytes())
        if source_revision:
            historical = subprocess.check_output(["git", "show", f"{source_revision}:{file}"], cwd=ROOT)
            assert sha(historical) == expected, (file, "captured commit does not reproduce source hash")
        else:
            assert current == expected, (file, "source changed after capture; explicitly verify its exact captured revision instead")
        if current != expected:
            source_differences.append({"file": file, "capturedSha256": expected, "currentSha256": current})
    for file, expected in evidence["assetHashes"].items():
        assert sha((ROOT / file).read_bytes()) == expected, (file, "theme artwork changed after capture")
    result = {"passed": False, "captureSha256": sha((OUT / "capture.json").read_bytes()),
              "sourceVerifiedAgainst": f"git:{source_revision}" if source_revision else "current-worktree",
              "capturedCommit": evidence["commitAtCapture"], "currentSourceMatchesCapture": not source_differences,
              "sourceDifferences": source_differences,
              "packs": [], "pngs": [], "gifs": [], "sessions": [], "screenshots": [], "presentation": [],
              "actualPhasePreservingSwitches": evidence["switches"], "themeComparisons": []}
    packs = {}
    for record in evidence["downloads"]:
        path = ROOT / record["file"]
        data = path.read_bytes()
        assert len(data) == record["bytes"] and sha(data) == record["sha256"]
        if record["kind"] == "pack":
            pack = helpers.Pack(path)
            packs[record["key"]] = pack
            with zipfile.ZipFile(ROOT / record["themeFile"]) as theme:
                manifest = verify_theme((ROOT / record["themeFile"]).read_bytes())
                look = next(look for look in manifest["looks"] if look["logicalId"] == record["lookId"])
                assert theme.read(look["file"]) == data
            if record["key"].endswith("-original-base"):
                character = record["key"].split("-")[0]
                assert data == (ROOT / f"docs/kling-motion/exports/{character}.character.zip").read_bytes()
            if record["key"].endswith("-original-wedding"):
                character = record["key"].split("-")[0]
                assert data == (ROOT / f"docs/kling-paint-roundtrip/evidence/{character}-wedding-before.character.zip").read_bytes()
            for frame_id in pack.frames:
                frame = pack.frame(frame_id)
                assert frame.mode == "RGBA" and frame.getbbox(), (path.name, frame_id)
                assert frame.size == (pack.m["spritesheet"]["frameWidth"], pack.m["spritesheet"]["frameHeight"])
            if pack.m["schemaVersion"] == 4:
                assert pack.m["scale"]["pixelArt"] and pack.m["scale"]["integerOnly"]
                assert pack.c["source"]["kind"] == "unified-archive"
                assert all(isinstance(pack.m["anchor"][coordinate], int) for coordinate in ["x", "y"])
            result["packs"].append({"file": record["file"], "frames": len(pack.frames),
                                    "exactSelectedVariantBytes": True, "allFramesDecoded": True,
                                    "schemaVersion": pack.m["schemaVersion"]})
    for record in evidence["downloads"]:
        path = ROOT / record["file"]
        if record["kind"] == "frame":
            pack = packs[record["key"]]
            expected = pack.frame(record["frameId"])
            if record["facing"] == "left":
                expected = ImageOps.mirror(expected)
            with Image.open(path) as actual:
                actual.load()
                assert actual.mode == "RGBA" and actual.size == expected.size
                assert actual.tobytes() == expected.tobytes()
            result["pngs"].append({"file": record["file"], "nativeRgbaExact": True})
        elif record["kind"] == "gif":
            result["gifs"].append(check_gif(path, packs[record["key"]], record["action"], record["facing"]))
        elif record["kind"] == "session":
            with zipfile.ZipFile(path) as session:
                assert session.testzip() is None
                document = json.loads(session.read("session.json"))
                assert document["format"] == "gathria-theme-session" and document["version"] == 1
                assert document["selection"] == record["selection"]
                for item in document["themes"]:
                    content = session.read(item["file"])
                    assert sha(content) == item["sha256"]
                    manifest = verify_theme(content)
                    assert item["key"] == f'{manifest["character"]}:{manifest["id"]}@{manifest["revision"]}'
            result["sessions"].append({"file": record["file"], "embeddedHashesExact": True,
                                       "allNestedPngZipJsonDecoded": True, "selectionRetained": True})
    for case in evidence["cases"]:
        sides = {r["facing"]: ROOT / r["file"] for r in evidence["downloads"]
                 if r["kind"] == "gif" and r["key"] == case["key"] and r["action"] == "run"}
        assert set(sides) == {"left", "right"}
        mirror_gifs(sides["left"], sides["right"])
    review = OUT.parent / "review"
    review.mkdir(exist_ok=True)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    for record in evidence["downloads"]:
        if record["kind"] == "gif":
            (review / Path(record["file"]).name).write_bytes((ROOT / record["file"]).read_bytes())
    for case in evidence["cases"]:
        pack = packs[case["key"]]
        clip = pack.m["animations"]["run"]
        pixel = pack.m["scale"]["pixelArt"]
        frames = [expected_gif(pack.frame(fid), pixel, "right") for fid in clip["frames"]]
        width, height = frames[0].size
        columns = min(4, len(frames)); rows = math.ceil(len(frames) / columns)
        sheet = Image.new("RGB", (columns * width, rows * (height + 24)), (238, 233, 223))
        draw = ImageDraw.Draw(sheet)
        for index, frame in enumerate(frames):
            x = index % columns * width; y = index // columns * (height + 24)
            draw.text((x + 4, y + 4), f'{index + 1}: pose {clip["frames"][index]}', font=font, fill=(40, 60, 53))
            sheet.paste(frame, (x, y + 24))
        sheet.save(review / f'{case["key"]}-run-keyframes.png')
        if pixel:
            sheet.resize((sheet.width * 2, sheet.height * 2), Image.Resampling.NEAREST).save(review / f'{case["key"]}-run-keyframes-2x.png')
            all_actions = ["idle", "walk", "run", "jump", "celebrate"]
            strip = Image.new("RGB", (width * 2 * len(all_actions), height * 2 + 32), (238, 233, 223))
            strip_draw = ImageDraw.Draw(strip)
            for index, action in enumerate(all_actions):
                action_clip = pack.m["animations"][action]
                position = len(action_clip["frames"]) // 2 if action in ["jump", "celebrate"] else 0
                frame_id = action_clip["frames"][position]
                frame = expected_gif(pack.frame(frame_id), True, "right").resize((width * 2, height * 2), Image.Resampling.NEAREST)
                strip.paste(frame, (index * width * 2, 32))
                strip_draw.text((index * width * 2 + 5, 7), f'{action.title()} / pose {frame_id} / 2x', font=font, fill=(40, 60, 53))
            strip.save(review / f'{case["key"]}-five-actions-2x.png')
    for character in ["male", "female"]:
        for look_id in ["base", "wedding"]:
            reference_case = next(case for case in evidence["cases"] if case["character"] == character and case["lookId"] == look_id and case["themeKey"] == f"{character}:kling-original@1")
            pixel_case = next(case for case in evidence["cases"] if case["character"] == character and case["lookId"] == look_id and case["themeKey"] == f"{character}:pixel-storybook@1")
            result["themeComparisons"].append(compare_themes(packs[reference_case["key"]], packs[pixel_case["key"]], character, look_id, review, font))
    for path in OUT.glob("*.png"):
        with Image.open(path) as image:
            image.load(); assert min(image.size) > 0
        if path.name.endswith(("-workspace.png", "-mobile.png", "-independent.png")):
            result["screenshots"].append(str(path.relative_to(ROOT)))
    for path in sorted(review.iterdir()):
        with Image.open(path) as image:
            for index in range(getattr(image, "n_frames", 1)):
                image.seek(index); image.load()
        result["presentation"].append({"file": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size})
    for pack in packs.values():
        pack.close()
    result["passed"] = True
    (OUT.parent / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({name: len(value) for name, value in result.items() if isinstance(value, list)}))


if __name__ == "__main__":
    if "--presentation-only" in sys.argv:
        verify_final_presentation()
    else:
        main()
