"""Compose review artifacts from real Studio exports and UI canvas captures.

This script is deliberately separate from the rig renderer. It reads exported
PNGs, preserves manifest frame order and timing, and uses integer nearest-neighbor
scaling. The neutral review stage is not a Gathria integration test. Technical
checks in this file do not imply visual acceptance.
"""

from functools import lru_cache
from pathlib import Path
import hashlib
import io
import json
import math
import os
import sys
import zipfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PHASE = os.environ.get("EVIDENCE_PHASE", "final")
assert PHASE == "final" or (
    PHASE.startswith("iterations/")
    and all(c.islower() or c.isdigit() or c in "-/" for c in PHASE)
)
D = ROOT / "docs/standard-kit" / PHASE
BG, STAGE, INK = "#f6f2e9", "#e8ecdf", "#45493d"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CHARACTERS = [
    (f"{hair}-{top}-{shoe}", f"{hair} / {top} / {shoe}")
    for hair in ("short", "sweep") for top in ("teal", "ochre") for shoe in ("boots", "sneakers")
]
IDS = [identifier for identifier, _ in CHARACTERS]
REPRESENTATIVES = ["short-teal-boots", "sweep-ochre-sneakers"]
ALL_IDS = IDS + [f"{identifier}-variant" for identifier in REPRESENTATIVES]
ACTIONS = ["idle", "walk", "run", "jump"]
EXPRESSIONS = ["neutral", "gentle", "joyful"]
RUN_PHASES = [
    "Near contact", "Near load", "Near toe-off", "Flight", "Flight",
    "Reach to far contact", "Far contact", "Far load", "Far toe-off",
    "Flight", "Flight", "Reach to near contact",
]


def font(size=13):
    return ImageFont.truetype(FONT, size)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inventory():
    """Decode every delivered image and archive member, not only named panels."""
    result = {
        "scope": "Every delivered file in this phase, excluding this inventory.",
        "counts": {},
        "files": [],
    }
    for path in sorted(D.rglob("*")):
        if not path.is_file() or path.name == "file-integrity.json":
            continue
        data = path.read_bytes()
        assert data, f"{path}: empty file"
        ext = path.suffix.lower().removeprefix(".")
        item = {
            "file": str(path.relative_to(D)),
            "bytes": len(data),
            "sha256": sha(data),
        }
        result["counts"][ext] = result["counts"].get(ext, 0) + 1
        if ext in ("png", "gif"):
            with Image.open(path) as image:
                loop = image.info.get("loop", "no loop extension; plays once")
                durations = []
                for index in range(image.n_frames):
                    image.seek(index)
                    image.load()
                    assert image.getbbox() is not None, f"{path}: blank frame {index}"
                    if ext == "gif":
                        durations.append(image.info["duration"])
                        assert durations[-1] > 0
                item.update(
                    dimensions=list(image.size),
                    decodedFrames=image.n_frames,
                    decodable=True,
                )
                if durations:
                    item.update(
                        frameDurationsMs=durations,
                        durationMs=sum(durations),
                        loop=loop,
                    )
        elif ext == "zip":
            with zipfile.ZipFile(path) as archive:
                assert archive.testzip() is None, f"{path}: CRC failure"
                names = archive.namelist()
                assert names and len(names) == len(set(names))
                members = []
                for name in names:
                    value = archive.read(name)
                    assert value, f"{path}/{name}: empty member"
                    member = {"name": name, "bytes": len(value), "sha256": sha(value)}
                    if name.endswith(".png"):
                        with Image.open(io.BytesIO(value)) as image:
                            image.load()
                            assert image.mode == "RGBA" and image.getbbox() is not None
                            assert set(image.getchannel("A").tobytes()) <= {0, 255}
                            member.update(
                                dimensions=list(image.size), decoded=True, binaryAlpha=True
                            )
                    elif name.endswith(".json"):
                        json.loads(value)
                        member["validJson"] = True
                    else:
                        value.decode("utf-8")
                    members.append(member)
                item.update(crcVerified=True, members=members)
        elif ext == "json":
            json.loads(data)
            item["validJson"] = True
        else:
            data.decode("utf-8")
        result["files"].append(item)
    (D / "file-integrity.json").write_text(json.dumps(result, indent=2) + "\n")
    print("All-file integrity:", result["counts"])


if "--inventory-only" in sys.argv:
    inventory()
    raise SystemExit(0)

evidence = json.loads((D / "evidence-index.json").read_text())
report = {
    "source": (
        "Actual Studio-exported CharacterPack PNGs and recorded UI canvas captures. "
        "Integer nearest-neighbor scale; neutral review stage only. Generated source "
        "concepts are not substituted for assembled output."
    ),
    "assessmentBoundary": (
        "Determinism, file integrity, exact pixels, transform metrics and playback "
        "timing are technical checks. Human visual review of seams, identity and "
        "motion remains separate; these checks do not grant visual acceptance."
    ),
    "png": [], "gif": [], "archives": [], "frames": [], "playback": [],
}


@lru_cache(None)
def manifest(identifier):
    return json.loads((D / identifier / "manifest.json").read_text())


@lru_cache(None)
def sheet(identifier):
    with Image.open(D / identifier / "spritesheet.png") as image:
        image.load()
        assert image.mode == "RGBA"
        return image.copy()


def frame(identifier, key, facing="right"):
    descriptor = next(f for f in manifest(identifier)["frames"] if f["id"] == key)
    x, y = descriptor["x"], descriptor["y"]
    image = sheet(identifier).crop(
        (x, y, x + descriptor["width"], y + descriptor["height"])
    )
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing == "left" else image


def action_frame(identifier, action, index=0, facing="right"):
    return frame(identifier, manifest(identifier)["animations"][action]["frames"][index], facing)


def save_png(image, filename):
    path = D / filename
    image.save(path)
    with Image.open(path) as decoded:
        decoded.load()
        assert decoded.mode == image.mode and decoded.tobytes() == image.tobytes()
    report["png"].append({
        "file": filename,
        "dimensions": list(image.size),
        "decodedPixelEquality": True,
        "sha256": sha(path.read_bytes()),
    })


def panel(items, columns, scale, title):
    cw, ch = 192 * scale + 20, 256 * scale + 48
    image = Image.new("RGB", (cw * columns + 20, ch * math.ceil(len(items) / columns) + 55), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 12), title, font=font(14), fill=INK)
    for index, (sprite, label) in enumerate(items):
        assert sprite.size == (192, 256) and sprite.mode == "RGBA"
        sprite = sprite.resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + index % columns * cw, 48 + index // columns * ch
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        image.paste(sprite, (x, y), sprite)
        lines, line = [], ""
        for word in label.split():
            candidate = f"{line} {word}".strip()
            if line and draw.textlength(candidate, font=font(12)) > 192 * scale:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
        draw.multiline_text((x, y + sprite.height + 5), "\n".join(lines), font=font(12), fill=INK, spacing=1)
    return image


def detail_panel(items, box, scale, title, columns=3):
    width, height = (box[2] - box[0]) * scale, (box[3] - box[1]) * scale
    cw, ch = width + 24, height + 42
    image = Image.new("RGB", (cw * columns + 16, ch * math.ceil(len(items) / columns) + 50), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 12), title, font=font(14), fill=INK)
    for index, (sprite, label) in enumerate(items):
        crop = sprite.crop(box).resize((width, height), Image.Resampling.NEAREST)
        x, y = 16 + index % columns * cw, 42 + index // columns * ch
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=STAGE)
        image.paste(crop, (x, y), crop)
        draw.text((x, y + height + 8), label, font=font(12), fill=INK)
    return image


def save_gif(events, filename, loop=False):
    """Verify decoded GIF pixels/order against the exact quantized input frames."""
    images = [image for image, _ in events]
    assert images and len({image.size for image in images}) == 1
    strip = Image.new("RGB", (images[0].width, images[0].height * len(images)))
    for index, image in enumerate(images):
        strip.paste(image, (0, index * image.height))
    palette = strip.quantize(colors=256, dither=Image.Dither.NONE)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    elapsed, previous, durations = 0, 0, []
    for _, duration in events:
        elapsed += duration
        target = round(elapsed / 10) * 10
        durations.append(target - previous)
        previous = target
    assert min(durations) > 0
    expected = []
    for image, duration in zip(indexed, durations):
        digest = sha(image.convert("RGB").tobytes())
        if expected and expected[-1][0] == digest:
            expected[-1][1] += duration
        else:
            expected.append([digest, duration])
    path = D / filename
    options = {"loop": 0} if loop else {}
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    disposal=1, optimize=False, **options)
    decoded = []
    with Image.open(path) as image:
        assert (image.info.get("loop") == 0) if loop else ("loop" not in image.info)
        for index in range(image.n_frames):
            image.seek(index)
            image.load()
            decoded.append([sha(image.convert("RGB").tobytes()), image.info["duration"]])
    assert decoded == expected, f"{filename}: decoded GIF sequence, timing or pixels differ"
    report["gif"].append({
        "file": filename, "logicalFrames": len(events), "decodedFrames": len(decoded),
        "dimensions": list(images[0].size), "durationMs": sum(t for _, t in decoded),
        "idealDurationMs": elapsed, "frameDurationsMs": [t for _, t in decoded],
        "decodedFrameSha256": [h for h, _ in decoded], "loop": loop,
        "timingRule": "Cumulative centisecond rounding of manifest fps; identical adjacent frames may coalesce.",
        "sha256": sha(path.read_bytes()),
    })


# Capture completeness and actual download contents are checked before composing.
assert evidence["authoringClosedBeforeConsumer"]
assert not evidence["errors"] and not evidence["external"] and not evidence["forbidden"]
for key, count in {"exports": 10, "playback": 64, "roundtrips": 8, "combinationSelections": 8,
                   "expressionFrames": 48, "editorFrames": 576, "topDyeChecks": 2, "regression": 8}.items():
    assert len(evidence[key]) == count, (key, len(evidence[key]))
assert all(item["pngDecodePixelEquality"] and item["deterministicPixels"] for item in evidence["exports"])
assert all(item["exactPixels"] for item in evidence["editorFrames"])
assert all(item["allAlphasStable"] and item["allFixedPixelsExact"] for item in evidence["topDyeChecks"])
for record in evidence["archives"]:
    path = D / record["file"]
    assert sha(path.read_bytes()) == record["sha256"]
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert sorted(archive.namelist()) == sorted(record["members"])
        for name, info in record["members"].items():
            data = archive.read(name)
            assert data and sha(data) == info["sha256"]
            if name.endswith(".png"):
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                    assert image.mode == "RGBA" and image.getbbox() is not None
                    assert set(image.getchannel("A").tobytes()) <= {0, 255}
            elif name.endswith(".json"):
                json.loads(data)
            else:
                data.decode("utf-8")
    report["archives"].append({"file": record["file"], "crcVerified": True,
        "allMembersDecodedAndHashed": True, "sha256": record["sha256"]})
for case in evidence["playback"]:
    assert sorted(case["expectedFrames"]) == sorted(case["matchedFrames"])
    assert all(abs(check["errorMs"]) <= case["timingAllowanceMs"] for check in case["timingChecks"])
    if case["action"] == "jump":
        assert case["finalPosition"] == 11 and case["replayStartedAtFirstFrameAndCompleted"]
        assert [item["frame"] for item in case["transitions"]] == list(range(24, 36))
    else:
        assert case["finalPosition"] >= len(case["expectedFrames"])
    report["playback"].append({"id": case["id"], "facing": case["facing"], "action": case["action"],
        "fullNativePngPixelsAndSequenceVerified": True, "loopOrOneShotReplayVerified": True, "timingVerified": True})
assert {(p["id"], p["facing"], p["action"]) for p in evidence["playback"]} == {
    (identifier, facing, action) for identifier in IDS for facing in ("right", "left") for action in ACTIONS}
report["portableRoundtrips"] = evidence["roundtrips"]
report["combinationControls"] = evidence["combinationSelections"]
report["sourceColorAndOwnership"] = evidence["topDyeChecks"]
report["editorFrameChecks"] = len(evidence["editorFrames"])
report["expressionCaptures"] = evidence["expressionFrames"]
for identifier in ALL_IDS:
    metadata = manifest(identifier)
    assert list(metadata["animations"]) == ACTIONS and len(metadata["frames"]) == 36
    assert metadata["anchor"] == {"x": 96, "y": 240, "units": "pixels", "origin": "top-left"}
    assert not metadata["animations"]["jump"]["loop"]
    assert all(metadata["animations"][action]["loop"] for action in ACTIONS[:-1])
    for descriptor in metadata["frames"]:
        rgba = frame(identifier, descriptor["id"])
        assert rgba.size == (192, 256)
        alpha = rgba.getchannel("A")
        assert alpha.getbbox() and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            assert alpha.crop(edge).getbbox() is None, f"{identifier}/{descriptor['id']}: clipped edge {edge}"
        assert frame(identifier, descriptor["id"], "left").transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes() == rgba.tobytes()
    report["frames"].append({"id": identifier, "all36FramesDecoded": True, "binaryAlpha": True,
        "clearBorders": True, "mirrorRoundtripExact": True})
for item in evidence["expressionFrames"]:
    path = D / item["file"]
    assert path.stat().st_size == item["bytes"] and sha(path.read_bytes()) == item["sha256"]
    with Image.open(path) as image:
        image.load()
        assert image.mode == "RGBA" and image.size == (192, 256)
        assert set(image.getchannel("A").tobytes()) == {0, 255}
        if item["expression"] == "neutral":
            assert image.tobytes() == action_frame(item["id"], item["action"], item["index"]).tobytes()
assert {(r["id"], r["expression"], r["action"]) for r in evidence["expressionFrames"]} == {
    (identifier, expression, action) for identifier in IDS for expression in EXPRESSIONS for action in ("idle", "run")}
regression = evidence["regression"]
assert {record["id"] for record in regression} == set(IDS)
for record in regression:
    assert record["preparedBindingsAndMotionExact"]
    assert record["sourceSlots"] and all(slot["exact"] for slot in record["sourceSlots"])
    assert record["rig"] == regression[0]["rig"]
    assert record["motions"] == regression[0]["motions"]
    assert len(record["motions"]["clips"]["run"]["keys"]) == 12
    assert record["motions"]["clips"]["run"]["fps"] == 18
report["sharedSkeletonAndMotion"] = {"allEightRigsExact": True, "allFourClipsExact": True,
    "allRunKeyCounts": 12, "allRunFps": 18, "preparedSourceArraysAndBindingsExact": True,
    "sourceSlots": [{"id": record["id"], "slots": record["sourceSlots"]} for record in regression],
    "note": "All eight combinations use one exact rig and complete motion library. No per-combination motion fitting or second renderer is substituted for the application output."}
geometry, shoe_metrics = [], []
for record in regression:
    assert len(record["run"]) == 12
    keys = []
    for pose in record["run"]:
        limbs = {limb["id"]: limb["bones"] for limb in pose["limbs"]}
        legs = []
        for side in ("near", "far"):
            hip, knee, ankle = limbs[side + "Leg"]
            length = math.dist(hip, knee) + math.dist(knee, ankle)
            distance = math.dist(hip, ankle)
            legs.append({
                "side": side, "hip": hip, "knee": knee, "ankle": ankle,
                "chainLength": length, "hipAnkleDistance": distance,
                "extensionRatio": distance / length,
            })
        keys.append({
            "key": pose["index"], "legs": legs,
            "nearFarAnkleDistance": math.dist(limbs["nearLeg"][2], limbs["farLeg"][2]),
            "nearMinusFarAnkleX": limbs["nearLeg"][2][0] - limbs["farLeg"][2][0],
        })
        for shoe in pose.get("shoes") or []:
            # Only source-axis shoes expose this transform. Legacy shoe variants
            # remain valid and are reviewed as PNGs; no hypothetical matrix is invented.
            reference = shoe.get("sourceShin")
            if reference is None:
                continue
            chain = shoe["chain"]
            knee, ankle = limbs[chain][1:]
            source = shoe["sourceAnkle"]
            source_angle = math.atan2(source[1] - reference[1], source[0] - reference[0])
            posed_angle = math.atan2(ankle[1] - knee[1], ankle[0] - knee[0])
            difference = shoe["rotation"] - (posed_angle - source_angle)
            error = math.atan2(math.sin(difference), math.cos(difference))
            matrix = shoe["matrix"]
            mapped = [matrix[0] * source[0] + matrix[2] * source[1] + matrix[4],
                      matrix[1] * source[0] + matrix[3] * source[1] + matrix[5]]
            linkage = math.dist(mapped, ankle)
            result = {
                "id": record["id"], "key": pose["index"], "chain": chain,
                "sourceShin": reference, "sourceAnkle": source,
                "posedShinAngleRadians": posed_angle,
                "renderedShoeRotationRadians": shoe["rotation"],
                "sourceRelativeAngleErrorDegrees": math.degrees(error),
                "matrixMappedAnkle": mapped, "posedAnkle": ankle,
                "matrixAnkleErrorPx": linkage, "actualOpaqueSoleY": shoe["sole"],
                "targetSoleY": shoe["targetSole"], "supportErrorPx": shoe["supportError"],
            }
            assert abs(error) < 1e-9 and linkage < 1e-9, result
            assert math.dist(shoe["ankle"], ankle) < 1e-9 and abs(shoe["supportError"]) <= 1, result
            shoe_metrics.append(result)
    deltas = {}
    for side in ("near", "far"):
        ankles = [next(leg["ankle"] for leg in key["legs"] if leg["side"] == side) for key in keys]
        changes = [(ankles[(i + 1) % 12][0] - a[0], ankles[(i + 1) % 12][1] - a[1]) for i, a in enumerate(ankles)]
        deltas[side] = {
            "maxConsecutiveAbsDeltaX": max(abs(x) for x, _ in changes),
            "maxConsecutiveAbsDeltaY": max(abs(y) for _, y in changes),
            "loopClosingDelta": changes[-1],
        }
    geometry.append({"id": record["id"], "keys": keys, "ankleStepDeltas": deltas})
report["runJointGeometry"] = geometry
report["actualShoeAttachmentMetrics"] = shoe_metrics
report["actualShoeAttachmentSummary"] = {
    "cases": len(shoe_metrics),
    "maximumAngleErrorDegrees": max((abs(r["sourceRelativeAngleErrorDegrees"]) for r in shoe_metrics), default=None),
    "maximumMatrixAnkleErrorPx": max((r["matrixAnkleErrorPx"] for r in shoe_metrics), default=None),
    "maximumSoleSupportErrorPx": max((abs(r["supportErrorPx"]) for r in shoe_metrics), default=None),
    "note": "Actual cached renderer transforms for shoes exposing sourceShin. Geometry alone does not prove seamless cuffs, attractive silhouettes, or natural motion.",
}

# These presentation panels only use actual exported PNGs and UI captures.
for scale in (1, 2):
    save_png(panel([(action_frame(identifier, "idle"), name) for identifier, name in CHARACTERS],
        4, scale, f"Two haircuts x two tops x two shoes / one body and motion / {scale}x"), f"lineup-{scale}x.png")
    save_png(panel([(action_frame(identifier, action, 0 if action == "idle" else 5), f"{identifier} / {action}")
        for identifier in IDS[:4] for action in ACTIONS], 4, scale,
        f"Four clothing combinations / actual exports / {scale}x"), f"four-actions-{scale}x.png")
    for identifier in IDS[:4]:
        save_png(panel([(action_frame(identifier, "run", index), f"{index + 1:02d} / {RUN_PHASES[index]}")
            for index in range(12)], 6, scale,
            f"{identifier} / all twelve exported run poses / {scale}x"), f"{identifier}-run-keyframes-{scale}x.png")
for action in ("idle", "run"):
    items = []
    for identifier in ("short-teal-boots", "sweep-teal-boots"):
        for expression in EXPRESSIONS:
            with Image.open(D / f"expressions/{identifier}-{expression}-{action}-1x.png") as image:
                image.load()
                items.append((image.copy(), f"{identifier} / {expression}"))
    save_png(panel(items, 3, 2, f"Same expression faces / two haircuts / actual UI / {action} / 2x"),
        f"expressions-{action}-2x.png")
    save_png(detail_panel(items, (30, 20, 165, 136), 3,
        f"Shared face / haircut overlay / {action} / 3x"), f"hair-face-{action}-3x.png")
save_png(detail_panel([(action_frame(identifier, "idle"), identifier) for identifier in IDS],
    (28, 30, 167, 145), 3, "Head, neck and shoulders / eight actual combinations / 3x", columns=4),
    "head-neck-shoulders-3x.png")
for identifier in IDS[:4]:
    selected = [0, 3, 6, 8, 9, 11]
    items = [(action_frame(identifier, "run", index), f"run {index + 1:02d}") for index in selected]
    save_png(detail_panel(items, (20, 95, 176, 190), 3,
        f"{identifier} / shoulder, cuff and waist / 3x"), f"{identifier}-shoulder-waist-3x.png")
    save_png(detail_panel(items, (20, 161, 176, 247), 3,
        f"{identifier} / knee, cuff and ankle / 3x"), f"{identifier}-knee-ankle-3x.png")
    save_png(detail_panel([(action_frame(identifier, "jump", index, facing), f"jump {index + 1:02d} / {facing}")
        for facing in ("right", "left") for index in (4, 5, 6)], (20, 140, 176, 247), 3,
        f"{identifier} / deep knee bend / both facings / 3x"), f"{identifier}-jump-knee-3x.png")
save_png(panel([(action_frame(pack_id, action, 0 if action == "idle" else 5), f"{identifier} / {label} / {action}")
    for identifier in REPRESENTATIVES for action in ("idle", "run")
    for pack_id, label in ((identifier, "neutral source colors"), (f"{identifier}-variant", "joyful recolored"))],
    4, 2, "Dark skin and light hair / semantic masks / actual exports / 2x"), "recolor-and-joyful-2x.png")

def pose_panel(identifier, name, action, key, facing, scale, note=""):
    return panel([(frame(identifier, key, facing), note or "Neutral review stage")], 1, scale,
        f"{name}\n{action} / {facing} / {scale}x")

for identifier, name in CHARACTERS:
    for facing in ("right", "left"):
        run = manifest(identifier)["animations"]["run"]
        for scale in (1, 2):
            save_gif([(pose_panel(identifier, name, "run", key, facing, scale, "In-place loop; no world translation"), 1000 / run["fps"])
                for key in run["frames"]], f"{identifier}-run-{facing}-{scale}x.gif", loop=True)
        if identifier not in REPRESENTATIVES:
            continue
        for action in ("idle", "walk", "jump"):
            clip = manifest(identifier)["animations"][action]
            note = "One shot; stops after landing" if action == "jump" else "In-place loop; no world translation"
            save_gif([(pose_panel(identifier, name, action, key, facing, 2, note), 1000 / clip["fps"])
                for key in clip["frames"]], f"{identifier}-{action}-{facing}-2x.gif", loop=clip["loop"])
        tour = []
        for action in ACTIONS:
            clip = manifest(identifier)["animations"][action]
            tour.extend((pose_panel(identifier, name, action, key, facing, 2, "Review tour repeats after landing"), 1000 / clip["fps"])
                for key in clip["frames"])
        final_key = manifest(identifier)["animations"]["jump"]["frames"][-1]
        tour.append((pose_panel(identifier, name, "jump", final_key, facing, 2, "Landed; review tour restarts"), 800))
        save_gif(tour, f"{identifier}-four-actions-{facing}-2x.gif", loop=True)
assert len(report["gif"]) == 48
(D / "artifact-validation.json").write_text(json.dumps(report, indent=2) + "\n")
inventory()
print(f"Validated {len(report['archives'])} archives, {len(report['frames']) * 36} exported poses, "
    f"{len(report['gif'])} GIFs, {len(report['playback'])} isolated playback cases.")
