"""Reextract original video pixels into a bounded, reproducible source archive.

No artwork is generated or redrawn. This is technical chroma-key processing:
fixed crop, estimated alpha and edge-only despill, followed by lossless PNG.
Requires ffmpeg/ffprobe, Pillow, NumPy, SciPy. All source identities/selection
decisions live in artwork/kling-playback/source/selection.json.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import subprocess
import tempfile
import zipfile

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--recipe", default="artwork/kling-playback/source/selection.json")
args = parser.parse_args()
recipe_path = ROOT / args.recipe
BASE = recipe_path.parent.parent
RECIPE = json.loads(recipe_path.read_text())
OUTPUT = BASE / "prepared"
OUTPUT.mkdir(parents=True, exist_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams",
        "-of", "json", str(path),
    ]))["streams"][0]


def chroma_key(source, profile):
    rgb = source.astype(np.float64)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # Relative green dominance keeps dark green floor shadows in background;
    # a luminance threshold would erase the source's dark shorts/outline.
    score = (g - np.maximum(r, b)) / np.maximum(g, 1)
    t = np.clip((score - profile["greenStart"]) /
                (profile["greenEnd"] - profile["greenStart"]), 0, 1)
    alpha = 1 - t * t * (3 - 2 * t)
    components, _ = label(alpha > .5)
    sizes = np.bincount(components.ravel())
    sizes[0] = 0
    main = components == sizes.argmax()
    keep = binary_dilation(main, iterations=3)
    # Record every excluded opaque component; fail on a substantial island so
    # that this cleanup cannot silently delete a detached hand/shoe.
    discarded = sorted((int(n) for i, n in enumerate(sizes)
                        if i and i != sizes.argmax() and n), reverse=True)
    if discarded and discarded[0] > 32:
        raise ValueError(f"Unexpected disconnected foreground: {discarded[:8]}")
    alpha[~keep] = 0
    a = np.rint(alpha * 255).astype(np.uint8)
    alpha = a.astype(np.float64) / 255
    edge = (a > 0) & (a < 255)
    # Screen estimate from an untouched corner. The originals stay archived;
    # transparent edge colors are necessarily estimates, not recovered layers.
    background = np.median(rgb[20:100, 20:100].reshape(-1, 3), axis=0)
    out = rgb.copy()
    out[edge] = (rgb[edge] - (1 - alpha[edge, None]) * background) / alpha[edge, None]
    out[edge, 1] = np.minimum(out[edge, 1], np.maximum(out[edge, 0], out[edge, 2]))
    out = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    out[a == 0] = 0
    assert np.array_equal(out[a == 255], source[a == 255]), "Opaque RGB changed"
    return np.dstack((out, a)), discarded, background.tolist()


def png(image):
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9)
    return output.getvalue()


def put(archive, path, data):
    info = zipfile.ZipInfo(path, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_STORED if path.endswith(".png") else zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


width, height = (RECIPE["canvas"][k] for k in ["width", "height"])
anchor = RECIPE["canvas"]["anchor"]
fps = RECIPE["fps"]
actions = RECIPE["actions"]
manifest = {
    "format": "Gathria Unified CharacterPack", "version": "1.0.0",
    "contract": "characterpack-v1", "name": "Original Kling characters / native pixels",
    "canvas": {"width": width, "height": height, "coordinate_origin": "top-left",
               "ground_y": anchor[1], "orientation": "right_3q"},
    "default_fps": fps, "render_mode": "baked_composite",
    "characters": list(RECIPE["characters"]),
    "actions": {}, "layers": {"body_composite": {"required": True}},
    "equipment_slots": {}, "derivation": RECIPE,
}
def action_key(name):
    return name + ("_once" if name == "jump" else "_loop")


for name, interval in actions.items():
    loop = interval.get("loop", True)
    count = interval["endExclusive"] - interval["start"]
    manifest["actions"][action_key(name)] = {
        "fps": fps, "frames": count, "repeat": -1 if loop else 0, "loop": loop,
        "is_candidate": True, "source_action": name,
        "selection_strategy": "original_forward_contiguous",
        "duration_ms": count * 1000 / fps,
        "frame_template": "characters/{character}/layers/body_composite/" + action_key(name) + "/{frame:03d}.png",
    }

report = {"recipeSha256": sha(recipe_path.read_bytes()),
          "canvas": RECIPE["canvas"], "fps": fps, "characters": {},
          "processing": "Fixed native crop; chroma-key alpha; edge-only unmix/despill; lossless RGBA8 PNG."}
legacy = RECIPE.get("legacyReference")
legacy_files = {}
if legacy:
    with zipfile.ZipFile(ROOT / legacy["archive"]) as old:
        legacy_files = {name: old.read(name) for name in old.namelist() if name.endswith(".png")}
legacy_matches = 0
with zipfile.ZipFile(OUTPUT / "kling-source.zip", "w") as archive:
    put(archive, "manifest.json", json_bytes(manifest))
    put(archive, "README.md", ("# Original Kling source frames\n\n" + "\n".join(RECIPE["notes"]) + "\n").encode())
    for identity, character in RECIPE["characters"].items():
        video = ROOT / character["video"]
        assert sha(video.read_bytes()) == character["sha256"], f"Wrong original video: {identity}"
        stream = probe(video)
        assert stream["width"] == 1920 and stream["height"] == 1080 and stream["r_frame_rate"] == "24/1"
        wanted = sorted({i for v in actions.values() for i in range(v["start"], v["endExclusive"])})
        # Extract only the selected original frames; ffmpeg writes RGB24 PNGs
        # without a resize/temporal interpolation/filter beyond frame selection.
        selection = "+".join(f"between(n,{v['start']},{v['endExclusive'] - 1})" for v in actions.values())
        frame_report = []
        metadata = {"id": identity, "name": character["name"], "schema_version": "1.0.0",
                    "canvas_ref": "manifest.canvas", "visual_mode": "baked_composite",
                    "source_archive": character["video"], "source_sha256": character["sha256"],
                    "actions": {}, "equipment": None, "equipment_status": "not_authored",
                    "normalization": {"scale": 1, "crop_origin": character["cropOrigin"],
                                      "target_ground_y": anchor[1], "target_head_anchor_x": anchor[0],
                                      "method": "fixed_crop_only_no_shape_change"}}
        with tempfile.TemporaryDirectory(prefix="kling-source-") as temp:
            subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"select='{selection}'",
                            "-fps_mode", "passthrough", "-pix_fmt", "rgb24", str(Path(temp) / "%04d.png")], check=True)
            extracted = sorted(Path(temp).glob("*.png"))
            assert len(extracted) == len(wanted)
            sources = dict(zip(wanted, extracted))
            for action, interval in actions.items():
                key = action_key(action)
                loop = interval.get("loop", True)
                frames = []
                metadata["actions"][key] = {"config": f"actions/{key}.json",
                    "frames_dir": f"layers/body_composite/{key}", "count": interval["endExclusive"] - interval["start"]}
                for index, source_frame in enumerate(range(interval["start"], interval["endExclusive"])):
                    source = np.array(Image.open(sources[source_frame]).convert("RGB"))
                    rgba, discarded, background = chroma_key(source, character["matte"])
                    x, y = character["cropOrigin"]
                    # Assert no retained character pixels lie outside the fixed crop.
                    outside = rgba[:, :, 3].copy()
                    outside[max(0, y):min(rgba.shape[0], y + height), max(0, x):min(rgba.shape[1], x + width)] = 0
                    assert not np.any(outside), f"Clipped foreground at {identity}/{source_frame}"
                    image = Image.fromarray(rgba, "RGBA").crop((x, y, x + width, y + height))
                    crop = np.array(image)
                    bounds = image.getbbox()
                    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < width and bounds[3] < height
                    encoded = png(image)
                    relative = f"layers/body_composite/{key}/{index:03d}.png"
                    archive_path = f"characters/{identity}/{relative}"
                    if archive_path in legacy_files:
                        old = np.array(Image.open(io.BytesIO(legacy_files[archive_path])).convert("RGBA"))
                        padding = legacy["paddingTop"]
                        assert not np.any(crop[:padding]), "Legacy top padding is not transparent"
                        assert np.array_equal(crop[padding:], old), f"Legacy pixels changed: {archive_path}"
                        legacy_matches += 1
                    put(archive, archive_path, encoded)
                    frames.append({"i": index, "source_action": action, "source_index": index,
                                   "source_video_frame": source_frame, "source_time_s": source_frame / fps,
                                   "image": relative,
                                   "anchors": {"ground": {"x": anchor[0], "y": anchor[1], "quality": "fixed_source_ground_reference"},
                                               "head": {"x": anchor[0], "y": None, "quality": "not_calibrated"}}})
                    a = crop[:, :, 3]
                    frame_report.append({"action": action, "frame": index, "sourceFrame": source_frame,
                        "sourceTimeSeconds": source_frame / fps, "pngSha256": sha(encoded),
                        "rgbaSha256": sha(crop.tobytes()), "bounds": bounds,
                        "opaquePixels": int(np.count_nonzero(a == 255)),
                        "partialAlphaPixels": int(np.count_nonzero((a > 0) & (a < 255))),
                        "opaqueRgbMatchesSource": True, "sourceTopEdgePixels": int(np.count_nonzero(rgba[0, :, 3])), "discardedForegroundComponents": discarded,
                        "backgroundRgbEstimate": background})
                    # One lossless raw crop provides a readable standing provenance
                    # comparison. Original full videos retain every other source frame.
                    if source_frame == 348:
                        Image.fromarray(source).crop((x, y, x + width, y + height)).save(OUTPUT / f"{identity}-source-standing.png")
                put(archive, f"characters/{identity}/actions/{key}.json", json_bytes({
                    "name": key, "fps": fps, "repeat": -1 if loop else 0, "loop": loop, "frames": frames,
                    "authoring_status": "original_forward_cycle_candidate_not_user_approved",
                    "required_slots": ["body_composite"], "optional_slots": [],
                    "occlusion_order_status": "baked_no_independent_clothing"}))
            put(archive, f"characters/{identity}/meta.json", json_bytes(metadata))
        report["characters"][identity] = {"video": character["video"], "videoSha256": character["sha256"],
            "sourceWidth": stream["width"], "sourceHeight": stream["height"],
            "sourceFps": stream["r_frame_rate"], "sourceFrames": int(stream["nb_frames"]),
            "cropOrigin": character["cropOrigin"], "frames": frame_report}
        print(f"{identity}: {len(frame_report)} native RGBA frames, opaque RGB unchanged", flush=True)
if legacy:
    assert legacy_matches == len(legacy_files), "Did not preserve every historical source frame"
    report["legacyFramesExactlyPreservedAfterPadding"] = legacy_matches
report["archiveSha256"] = sha((OUTPUT / "kling-source.zip").read_bytes())
(OUTPUT / "extraction-report.json").write_bytes(json_bytes(report))
print(f"Archive {report['archiveSha256']}", flush=True)
