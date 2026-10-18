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
D = ROOT / "docs/character-roster" / PHASE
BG, STAGE, INK = "#f6f2e9", "#e8ecdf", "#45493d"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CHARACTERS = [("ravi", "Ravi"), ("lina", "Lina"), ("nora", "Nora")]
IDS = [identifier for identifier, _ in CHARACTERS]
ALL_IDS = IDS + [f"{identifier}-variant" for identifier in IDS]
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
assert len(evidence["exports"]) == 6
assert len(evidence["playback"]) == 24
assert len(evidence["roundtrips"]) == 3
assert len(evidence["identityChecks"]) == 3
assert len(evidence["itemRoundtrips"]) == 4
assert len(evidence["expressionFrames"]) == 18
assert len(evidence["editorFrames"]) == 216
assert len(evidence["topDyeChecks"]) == 3
assert len(evidence["regression"]) == 3
assert len(evidence["crossSwapChecks"]) == 3
assert len(evidence["rejectedProjectChecks"]) == 1
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
    report["archives"].append({
        "file": record["file"], "crcVerified": True,
        "allMembersDecodedAndHashed": True, "sha256": record["sha256"],
    })

for case in evidence["playback"]:
    assert sorted(case["expectedFrames"]) == sorted(case["matchedFrames"])
    assert all(abs(check["errorMs"]) <= case["timingAllowanceMs"] for check in case["timingChecks"])
    if case["action"] == "jump":
        assert case["finalPosition"] == 11 and case["replayStartedAtFirstFrameAndCompleted"]
        assert [item["frame"] for item in case["transitions"]] == list(range(24, 36))
    else:
        assert case["finalPosition"] >= len(case["expectedFrames"])
    report["playback"].append({
        "id": case["id"], "facing": case["facing"], "action": case["action"],
        "fullNativePngPixelsAndSequenceVerified": True,
        "loopOrOneShotReplayVerified": True, "timingVerified": True,
    })
assert {(p["id"], p["facing"], p["action"]) for p in evidence["playback"]} == {
    (identifier, facing, action)
    for identifier in IDS for facing in ("right", "left") for action in ACTIONS
}
report["portableRoundtrips"] = {
    "clothing": evidence["itemRoundtrips"],
    "identities": evidence["identityChecks"],
    "projects": evidence["roundtrips"],
}
report["sourceColorAndOwnership"] = evidence["topDyeChecks"]
report["editorFrameChecks"] = len(evidence["editorFrames"])
report["expressionCaptures"] = evidence["expressionFrames"]
for case in evidence["crossSwapChecks"]:
    assert case["rigAndMotionPreserved"]
    if case["rejected"]:
        assert case["atomicRejectVerified"]
        assert case["historyBefore"] == case["historyAfter"]
        assert case["beforeCanvasSha256"] == case["afterCanvasSha256"]
    else:
        assert case["acceptedAll12RunKeysRendered"]
for case in evidence["rejectedProjectChecks"]:
    assert case["allProjectMembersExact"] and case["canvasPixelsExact"] and case["undoHistoryExact"]
report["crossGarmentOutcomes"] = evidence["crossSwapChecks"]
report["incompatibleProjectRejection"] = evidence["rejectedProjectChecks"]

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
    report["frames"].append({
        "id": identifier, "all36FramesDecoded": True, "binaryAlpha": True,
        "clearBorders": True, "mirrorRoundtripExact": True,
    })

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
    (identifier, expression, action)
    for identifier in IDS for expression in EXPRESSIONS for action in ("idle", "run")
}

regression = evidence["regression"]
assert {record["id"] for record in regression} == set(IDS)
for record in regression:
    assert record["preparedBindingsAndMotionExact"]
    assert record["sourceSlots"] and all(slot["exact"] for slot in record["sourceSlots"])
    assert record["rig"] == regression[0]["rig"]
    for action in ("idle", "walk", "jump"):
        assert record["motions"]["clips"][action] == regression[0]["motions"]["clips"][action]
    assert len(record["motions"]["clips"]["run"]["keys"]) == 12
    assert record["motions"]["clips"]["run"]["fps"] == 18
by_id = {record["id"]: record for record in regression}
baseline_run = by_id["ravi"]["motions"]["clips"]["run"]
fit_fields = {"footX", "footLift", "bodyBob"}
run_fit_records = []
for record in regression:
    current_run = record["motions"]["clips"]["run"]
    assert {name: value for name, value in current_run.items() if name != "keys"} == {
        name: value for name, value in baseline_run.items() if name != "keys"
    }
    assert record["motions"]["version"] in (1, 2)
    adaptation = record["runAdaptation"]
    assert adaptation["baseline"] == "ravi"
    assert adaptation["baselineMotionVersion"] == by_id["ravi"]["motions"]["version"]
    assert adaptation["selectedMotionVersion"] == record["motions"]["version"]
    assert adaptation["clipOrderTimingLoopExact"] and adaptation["nonRunClipsExact"]
    bob_offsets, changed_keys = [], []
    for index, key in enumerate(current_run["keys"]):
        baseline_key = baseline_run["keys"][index]
        assert {name: value for name, value in key.items() if name not in fit_fields} == {
            name: value for name, value in baseline_key.items() if name not in fit_fields
        }, f"{record['id']}: run changed outside the documented fit fields"
        bob_offsets.append(key["bodyBob"] - baseline_key["bodyBob"])
        changes = [
            {"field": name, "before": baseline_key[name], "after": key[name]}
            for name in sorted(fit_fields) if key[name] != baseline_key[name]
        ]
        if changes:
            changed_keys.append({"index": index, "changes": changes})
    assert [{"index": item["index"], "changes": sorted(item["changes"], key=lambda change: change["field"])}
            for item in adaptation["changedKeys"]] == changed_keys
    run_fit_records.append({
        "id": record["id"],
        "selectedMotionVersion": record["motions"]["version"],
        "runSemantics": "hip-local" if record["motions"]["version"] == 1 else "pelvis-relative feet",
        "permittedFields": sorted(fit_fields),
        "otherRunFieldsExact": True,
        "bodyBobOffsets": bob_offsets,
        "constantBodyBobOffset": bob_offsets[0] if len(set(bob_offsets)) == 1 else None,
        "fittedKeys": [{name: key[name] for name in sorted(fit_fields)} for key in current_run["keys"]],
        "savedAdaptation": adaptation,
    })
report["sharedSkeletonAndMotion"] = {
    "allThreeRigsExact": True, "allNonRunClipsExact": True,
    "allRunKeyCounts": 12, "allRunFps": 18, "allRunClipOrderTimingLoopExact": True,
    "preparedSourceArraysAndBindingsExact": True,
    "sourceSlots": [{"id": record["id"], "slots": record["sourceSlots"]} for record in regression],
    "runFit": run_fit_records,
    "note": "All three identities use the same anatomical rig and identical idle/walk/jump clips. Run adaptation is saved per character: Motion V1 uses hip-local semantics; Motion V2 uses pelvis-relative feet. The final Lina and Nora outfits use a fitted Motion V2 profile; Nora wears coral-recolored shorts and the shared sneakers, not the rejected skirt study. Only footX, footLift and bodyBob key values may differ from Ravi; every other key field and clip-level setting remains exact. This is explicit outfit-specific fitting, not universal motion retargeting. No second renderer is substituted for these captures.",
}

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

# Review images: only actual pack pixels and separately recorded UI expressions.
for scale in (1, 2):
    save_png(panel([(action_frame(identifier, "idle"), name) for identifier, name in CHARACTERS],
                   3, scale, f"Three identities / same rig / actual exports / {scale}x"), f"lineup-{scale}x.png")
    save_png(panel([(action_frame(identifier, action, 0 if action == "idle" else 5), f"{name} / {action}")
                    for identifier, name in CHARACTERS for action in ACTIONS],
                   4, scale, f"Same rig / fitted run paths / actual exports / {scale}x"), f"four-actions-{scale}x.png")
    for identifier, name in CHARACTERS:
        save_png(panel([(action_frame(identifier, "run", index), f"{index + 1:02d} / {RUN_PHASES[index]}")
                        for index in range(12)], 6, scale,
                       f"{name} / all twelve exported run poses / {scale}x"), f"{identifier}-run-keyframes-{scale}x.png")

for action in ("idle", "run"):
    items = []
    for identifier, name in CHARACTERS:
        for expression in EXPRESSIONS:
            with Image.open(D / f"expressions/{identifier}-{expression}-{action}-1x.png") as image:
                image.load()
                items.append((image.copy(), f"{name} / {expression}"))
    save_png(panel(items, 3, 2, f"Three expressions / actual Studio canvas / {action} / 2x"),
             f"expressions-{action}-2x.png")

save_png(detail_panel([(action_frame(identifier, "idle"), name) for identifier, name in CHARACTERS],
                      (28, 30, 167, 145), 3,
                      "Head, neck and shoulders / actual idle exports / 3x"), "head-neck-shoulders-3x.png")
for identifier, name in CHARACTERS:
    selected = [0, 3, 6, 8, 9, 11]
    items = [(action_frame(identifier, "run", index), f"{name} / run {index + 1:02d}") for index in selected]
    save_png(detail_panel(items, (20, 95, 176, 190), 3,
                          f"{name} / shoulder, cuff and waist / selected run poses / 3x"),
             f"{identifier}-shoulder-waist-3x.png")
    save_png(detail_panel(items, (20, 161, 176, 247), 3,
                          f"{name} / knee, cuff and ankle / selected run poses / 3x"),
             f"{identifier}-knee-ankle-3x.png")

save_png(panel([(action_frame(pack_id, action, 0 if action == "idle" else 5), f"{name} / {label} / {action}")
                for identifier, name in CHARACTERS for action in ("idle", "run")
                for pack_id, label in ((identifier, "neutral, authored colors"), (f"{identifier}-variant", "joyful, recolored"))],
               4, 2, "Two settings / expression AND palette change / actual exports / 2x"),
         "recolor-and-joyful-2x.png")

# Explicit review targets retain the actual colors and silhouettes. These
# crops expose current limitations rather than hiding them behind broad panels.
ravi_expressions = []
for expression in EXPRESSIONS:
    with Image.open(D / f"expressions/ravi-{expression}-idle-1x.png") as image:
        image.load()
        ravi_expressions.append((image.copy(), f"Ravi / {expression} / idle 01"))
save_png(detail_panel(ravi_expressions, (35, 22, 163, 133), 3,
                      "Ravi / expression and face-tone comparison / actual UI / 3x"),
         "ravi-expression-face-tone-3x.png")

lina_jump_keys = (4, 5, 6)
save_png(detail_panel([
    (action_frame("lina", "jump", index, facing), f"Lina / jump {index + 1:02d} / {facing}")
    for facing in ("right", "left") for index in lina_jump_keys
], (20, 140, 176, 247), 3,
    "Lina / bent-knee silhouette / jump 05-07 / both facings / 3x"),
    "lina-jump-knee-3x.png")

save_png(detail_panel([
    (action_frame("nora", action, 5), f"Nora / {action} 06 / right")
    for action in ("run", "jump")
], (10, 15, 182, 247), 3,
    "Nora / ponytail and coral shorts / run and jump / 3x", columns=2),
    "nora-ponytail-outfit-3x.png")
report["focusedVisualReviewPanels"] = [
    {
        "file": "ravi-expression-face-tone-3x.png",
        "source": "Three actual idle UI expression captures; no recoloring in this panel.",
        "crop": [35, 22, 163, 133],
        "reviewQuestion": "Compare whole-face tone, identity, jaw and neck across the three authored expressions.",
    },
    {
        "file": "lina-jump-knee-3x.png",
        "source": "Actual neutral CharacterPack jump frames, mirrored for left facing.",
        "sequenceIndices": list(lina_jump_keys),
        "manifestFrameIds": [manifest("lina")["animations"]["jump"]["frames"][index] for index in lina_jump_keys],
        "crop": [20, 140, 176, 247],
        "reviewQuestion": "Inspect the inward bare-knee contour at zero-based jump key 5, with adjacent keys and mirrored playback.",
    },
    {
        "file": "nora-ponytail-outfit-3x.png",
        "source": "Actual neutral CharacterPack run and jump, zero-based sequence key 5.",
        "crop": [10, 15, 182, 247],
        "reviewQuestion": "Inspect ponytail overlap, blouse-to-shorts connection and coral shorts in two demanding poses. This playable outfit is distinct from the rejected skirt study; no duplicate-part defect is presumed.",
    },
]


def pose_panel(identifier, name, action, key, facing, scale, note=""):
    title = f"{name} / {action} / {facing} / {scale}x"
    if scale > 1:
        title += " / in place"
    return panel([(frame(identifier, key, facing), note or "Neutral review stage")], 1, scale, title)


for identifier, name in CHARACTERS:
    for facing in ("right", "left"):
        for action in ACTIONS:
            clip = manifest(identifier)["animations"][action]
            note = "One shot; stops after landing" if action == "jump" else "In-place loop; no world translation"
            save_gif([(pose_panel(identifier, name, action, key, facing, 2, note), 1000 / clip["fps"])
                      for key in clip["frames"]], f"{identifier}-{action}-{facing}-2x.gif", loop=clip["loop"])
        clip = manifest(identifier)["animations"]["run"]
        save_gif([(pose_panel(identifier, name, "run", key, facing, 1, "In-place loop"), 1000 / clip["fps"])
                  for key in clip["frames"]], f"{identifier}-run-{facing}-1x.gif", loop=True)
        tour = []
        for action in ACTIONS:
            clip = manifest(identifier)["animations"][action]
            tour.extend((pose_panel(identifier, name, action, key, facing, 2, "Review tour repeats after landing"),
                         1000 / clip["fps"]) for key in clip["frames"])
        final_key = manifest(identifier)["animations"]["jump"]["frames"][-1]
        tour.append((pose_panel(identifier, name, "jump", final_key, facing, 2,
                                "Landed; review tour restarts"), 800))
        save_gif(tour, f"{identifier}-four-actions-{facing}-2x.gif", loop=True)

assert len(report["gif"]) == 36
(D / "artifact-validation.json").write_text(json.dumps(report, indent=2) + "\n")
inventory()
print(f"Validated {len(report['archives'])} archives, {len(report['frames']) * 36} exported poses, "
      f"{len(report['gif'])} GIFs, {len(report['playback'])} isolated playback cases.")
