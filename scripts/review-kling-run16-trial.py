#!/usr/bin/env python3
"""Register and diagnose the rejected 16-pose male run experiment.

This is technical atlas packing, not artwork correction. Both image-generation
outputs remain intact. The candidate deliberately stays outside the published
catalog: its arm ownership/phase mistakes fail the visual gate.
"""
import copy
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artwork/kling-themes/source/continuity-v3"
OUT = ROOT / ".review-tmp/continuity-v3/run16-authoring"
OUT.mkdir(parents=True, exist_ok=True)
SHA = lambda b: hashlib.sha256(b).hexdigest()
MATTE = (238, 233, 223)
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)


def dump(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def landmarks(image):
    a = np.array(image)
    y, x = np.where(a[:, :, 3] > 128)
    top, foot = int(y.min()), int(y.max())
    _, hx = np.where(a[top:min(top + 75, 140), :, 3] > 128)
    return {"crownY": top, "footY": foot,
            "crownX": (int(hx.min()) + int(hx.max())) / 2,
            "upperWidth": int(hx.max()) - int(hx.min()) + 1}


def metrics(rows, fps):
    ys = [r["crownY"] for r in rows]
    steps = [abs(ys[(i+1) % len(ys)] - v) for i, v in enumerate(ys)]
    return {"frames": len(rows), "fps": fps, "cycleSeconds": len(rows)/fps,
            "crownRange": max(ys)-min(ys), "largestAdjacentCrownStep": max(steps),
            "largestCrownStepTimesFps": max(steps)*fps,
            "meanCyclicCrownSpeedPixelsPerSecond": sum(steps)/(len(rows)/fps),
            "upperWidthRange": max(r["upperWidth"] for r in rows)-min(r["upperWidth"] for r in rows),
            "crownXRange": max(r["crownX"] for r in rows)-min(r["crownX"] for r in rows)}


sources = [ART / f"male-run16-half-{half}-v1.png" for half in ["a", "b"]]
joined = Image.new("RGBA", (1536, 2048))
for i, path in enumerate(sources):
    im = Image.open(path).convert("RGBA")
    assert im.size == (1536, 1024)
    joined.paste(im, (0, i*1024))
joined_path = ART / "male-run16-rejected-atlas.png"
joined.save(joined_path)

# Feet register against a small in-place run trajectory, with contact/support
# poses on the existing y250/251 ground. No head Y lock or per-pose scale.
target_feet = [247, 249, 250, 251, 251, 250, 247, 247] * 2
translations, crops, candidates, rows = [], [], [], []
for i in range(16):
    rect = [(i % 4)*384, (i // 4)*512, 384, 512]
    x, y, w, h = rect
    cell = joined.crop((x, y, x+w, y+h))
    a = np.array(cell)
    sy, sx = np.where(a[:, :, 3] > 128)
    top, foot = int(sy.min()), int(sy.max())
    _, hx = np.where(a[top:top+150, :, 3] > 128)
    head_x = (int(hx.min())+int(hx.max()))/2
    dx = round((210-head_x)/2)*2
    dy = round((target_feet[i]*2-32-foot)/2)*2
    registered = Image.new("RGBA", (384, 544))
    visible = cell.getchannel("A").point(lambda v: 255 if v>16 else 0).getbbox()
    assert visible and visible[0]+dx >= 0 and visible[2]+dx <= 384
    assert visible[1]+dy+32 >= 0 and visible[3]+dy+32 <= 544
    registered.paste(cell, (dx, dy+32))
    native = registered.resize((192, 272), Image.Resampling.NEAREST)
    candidates.append(native)
    translations.append([dx, dy]); crops.append(rect)
    rows.append({"pose": i, "sourceBank": "a" if i<8 else "b", "sourceCell": i%8,
                 "crop": rect, "translation": [dx, dy], "sourceTop": top,
                 "sourceFoot": foot, "targetFoot": target_feet[i], **landmarks(native)})
assert len({SHA(im.tobytes()) for im in candidates}) == 16

baseline_path = ROOT / "docs/kling-theme-stability/evidence/male-pixel-v2-base.character.zip"
with zipfile.ZipFile(baseline_path) as z:
    m = json.loads(z.read("manifest.json"))
    atlas = Image.open(io.BytesIO(z.read(m["spritesheet"]["file"]))).convert("RGBA")
    old = []
    for fid in m["animations"]["run"]["frames"]:
        f = next(f for f in m["frames"] if f["id"] == fid)
        old.append(atlas.crop((f["x"], f["y"], f["x"]+f["width"], f["y"]+f["height"])))
before_rows = [landmarks(im) for im in old]

recipe = json.loads((ART.parent / "male-pixel-storybook-v2.recipe.json").read_text())
recipe = copy.deepcopy(recipe)
for action in recipe["actions"].values():
    action["file"] = "../" + action["file"]
recipe.update(id="pixel-storybook-run-study", revision=1, name="REJECTED 16-pose run study")
recipe["provenance"] = ("Rejected authoring experiment, not a published replacement. Two original image-generation banks supply sixteen distinct male running drawings, packed losslessly into one atlas and registered by whole-pose integer translations plus uniform 2:1 sampling. It retains the R2 native canvas, anchor and 2/3 second run duration (16 drawings at24FPS), but fails visual acceptance because arms acquire extra/disconnected anatomy and reverse phase abruptly. The shipping male remains exact R2. No skeleton, crossfade, duplicated pose, anatomical retouch or head lock is used. All other actions retain their R2 drawings.")
recipe["actions"]["run"] = {"file": joined_path.name, "columns": 4, "rows": 4,
                              "sourceSize": [1536, 2048], "cellIndices": list(range(16)),
                              "cropRects": crops, "translations": translations,
                              "fps": 24, "loop": True, "timeline": list(range(16)),
                              "notes": recipe["provenance"]}
recipe["registrationReview"] = {"status": "rejected", "reviewFile": "male-run16-review.json",
                                "basisRecipe": "artwork/kling-themes/source/male-pixel-storybook-v2.recipe.json"}
dump(ART / "male-run16-rejected.recipe.json", recipe)

review = {"status": "rejected; shipping male pixel R2 unchanged",
          "basisActualExport": str(baseline_path.relative_to(ROOT)),
          "basisSha256": SHA(baseline_path.read_bytes()),
          "sources": [{"file": str(p.relative_to(ROOT)), "sha256": SHA(p.read_bytes())} for p in sources],
          "joinedAtlas": {"file": str(joined_path.relative_to(ROOT)), "sha256": SHA(joined_path.read_bytes()),
                          "method": "Exact RGBA paste of A at0,0 andB at0,1024; no visual edits"},
          "cadence": {"before": "8 unique drawings at12FPS", "trial": "16 unique drawings at24FPS", "sameCycleSeconds": 2/3},
          "before": {"measurements": before_rows, "metrics": metrics(before_rows, 12)},
          "trial": {"measurements": rows, "metrics": metrics(rows, 24)},
          "visualRejectionReasons": [
              {"poses": [4, 5], "finding": "Half A near arm suddenly crosses the chest at4 then returns behind at5; the supposed inbetweens do not preserve arm progression."},
              {"poses": [8], "finding": "Half B first pose has an apparent extra near upper arm: a backward shoulder/arm silhouette remains while another arm crosses in front from that shoulder."},
              {"poses": [9], "finding": "Half B second pose has a disconnected-looking forearm patch across the tank; shoulder-to-forearm ownership is not plausible."},
              {"poses": [10], "finding": "Half B reverses back to the first-half arm direction too early, so the opposite stride is not a coherent continuation."}],
          "checks": {"all16RgbaDrawingsUnique": True, "sameNativeCanvas": [192,272], "sameAnchor": [96,251],
                     "noPerPoseScale": True, "noHeadYLock": True, "noAnatomyWarpOrPatch": True,
                     "technicalMetricsAreNotVisualAcceptance": True},
          "nextCondition": "Author coherent near/far limb ownership for a complete opposite stride before another16-frame rollout; a frame-count increase alone is not acceptance."}
dump(ART / "male-run16-review.json", review)

# Authoring inspection only. Final delivery comparison must use actual UI exports.
for zoom in [1,2]:
    board = Image.new("RGB", (192*zoom*8, (272*zoom+24)*3), MATTE)
    draw = ImageDraw.Draw(board)
    for row, frames, label in [(0,old,"R2 accepted"),(1,candidates[:8],"REJECTED A"),(2,candidates[8:],"REJECTED B")]:
        for i, im in enumerate(frames):
            x,y=i*192*zoom,row*(272*zoom+24)
            display=Image.new("RGBA",im.size,MATTE+(255,)); display.alpha_composite(im)
            board.paste(display.convert("RGB").resize((192*zoom,272*zoom),Image.Resampling.NEAREST),(x,y+24))
            draw.text((x+3,y+4), f"{label} / {i if row<2 else i+8}",font=FONT,fill=(40,60,53))
    board.save(OUT / f"male-run16-authoring-{zoom}x.png")
print(json.dumps({"recipe":str((ART/'male-run16-rejected.recipe.json').relative_to(ROOT)),
                  "before":review['before']['metrics'],"trial":review['trial']['metrics'],"status":review['status']},indent=2))
