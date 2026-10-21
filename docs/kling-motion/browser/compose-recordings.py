"""Keep complete, best observed flow recordings; never select individual poses.

Usage: python compose-recordings.py PRIOR_CAPTURE_DIRECTORY OUTPUT_DIRECTORY
Both directories must contain the evidence index and four flow GIF/PNG pairs.
The prior directory is read-only. Output must be the single deferred recapture.
"""

import copy
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

prior, output = map(Path, sys.argv[1:])
before = json.loads((prior / "evidence-index.json").read_text())
report = json.loads((output / "evidence-index.json").read_text())
assert before["passed"] and report["passed"]
assert before["inputHashes"] == report["inputHashes"]
assert "recordingSelection" not in report, "Do not compose an already composed review."
originals = {(c["character"], c["facing"]): c for c in before["flowCases"]}
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frames(path):
    result, delays = [], []
    with Image.open(path) as im:
        assert "loop" not in im.info
        for i in range(im.n_frames):
            im.seek(i)
            result.append(im.convert("RGB"))
            delays.append(im.info["duration"])
    return result, delays


for case in report["flowCases"]:
    key = (case["character"], case["facing"])
    old = originals[key]
    media = case["media"]
    source_gif = output / media["gif"]
    source_png = output / media["png"]
    initial_hash = old["media"]["gifSha256"]
    deferred_hash = media["gifSha256"]
    assert digest(prior / media["gif"]) == initial_hash
    assert digest(source_gif) == deferred_hash
    if case["character"] == "male":
        left, delays = frames(prior / media["gif"])
        right, second_delays = frames(source_gif)
        assert delays == second_delays and len(left) == len(right) == 116
        combined = []
        for old_frame, new_frame in zip(left, right):
            assert old_frame.size == new_frame.size == (704, 624)
            frame = new_frame.copy()
            frame.paste(old_frame.crop((0, 0, 352, 624)), (0, 0))
            draw = ImageDraw.Draw(frame)
            draw.rectangle((0, 0, 703, 25), fill="#f3f0e7")
            draw.text((9, 7), f"male / {case['facing']} / 1x: instant initial capture; queued deferred capture", font=font, fill="#30453b")
            combined.append(frame)
        palette_sheet = Image.new("RGB", (352, 264 * len(combined)))
        for i, frame in enumerate(combined):
            palette_sheet.paste(frame.resize((352, 264)), (0, i * 264))
        palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in combined]
        indexed[0].save(source_gif, save_all=True, append_images=indexed[1:], duration=delays, disposal=2, optimize=False)
        board = Image.open(source_png).convert("RGB")
        old_board = Image.open(prior / media["png"]).convert("RGB")
        assert board.size == old_board.size
        board.paste(old_board.crop((0, 0, 352, board.height)), (0, 0))
        draw = ImageDraw.Draw(board)
        draw.rectangle((0, 0, 703, 27), fill="#f3f0e7")
        draw.text((8, 8), f"male / {case['facing']} / nearest samples: initial instant; deferred queued", font=font, fill="#30453b")
        board.save(source_png)
        case["instant"] = copy.deepcopy(old["instant"])
        case["sampling"]["instant"] = copy.deepcopy(old["sampling"]["instant"])
        case["captureProvenance"] = {
            "instant": {"batch": "initial", "sourceGifSha256": initial_hash, "batchStartedAt": before["startedAt"]},
            "queued": {"batch": "deferred", "sourceGifSha256": deferred_hash, "batchStartedAt": report["flowRecapture"]["startedAt"]},
            "composition": "Complete timed columns from saved actual-canvas GIFs, same 116-frame/4800ms review timeline. No per-pose selection or synthetic frames. GIF colors are requantized; source PNGs remain authoritative.",
        }
    elif case["facing"] == "right":
        source_gif.write_bytes((prior / media["gif"]).read_bytes())
        source_png.write_bytes((prior / media["png"]).read_bytes())
        case.clear()
        case.update(copy.deepcopy(old))
        media = case["media"]
        case["captureProvenance"] = {"both": {"batch": "initial", "sourceGifSha256": initial_hash, "batchStartedAt": before["startedAt"]}, "reason": "The initial complete pair observed all 39 jump ticks on both sides without active observation stalls."}
    else:
        case["captureProvenance"] = {"both": {"batch": "deferred", "sourceGifSha256": deferred_hash, "batchStartedAt": report["flowRecapture"]["startedAt"]}}
    decoded, delays = frames(source_gif)
    assert len(decoded) == 116 and sum(delays) == 4800
    Image.open(source_png).load()
    media.update(gifSha256=digest(source_gif), pngSha256=digest(source_png), decoded=True)

for item in report["pngValidation"]:
    path = output / item["file"]
    image = Image.open(path)
    image.load()
    item.update(bytes=path.stat().st_size, dimensions=list(image.size), decoded=True)
report["recordingSelection"] = {
    "completedAt": datetime.now(timezone.utc).isoformat(),
    "method": "Keep complete per-mode recordings from the initial run and one deferred-encoding recapture. No further browser captures or individual pose selection.",
    "remainingLimit": "Male/left queued recording retains a 247ms observation gap during celebration. Nearest captured boundary samples are not an exact engine-exit trace. Other selected active recordings have no observation gaps above90ms; terminal one-shot holds are intentional.",
    "script": "compose-recordings.py",
}
(output / "evidence-index.json").write_text(json.dumps(report, indent=2) + "\n")
print("Selected four complete flow comparisons; all GIF frames/delays and PNGs decode; media hashes updated.")
