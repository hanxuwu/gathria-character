#!/usr/bin/env python3
"""Fit an existing painted sleeve independently of an occluded torso waist.

The accepted 220ea2f blouse supplies all unchanged pixels. This script never
regenerates its torso or samples a generated face/body. Run-frame sleeves use
one isolated, existing painted cuff/puff. Source skin is restored where the old
torso fit wrongly covered the near arm; all source head/hand protection remains
strict. It is a cloth fitting operation, not a source-pose deformation.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from kling_side_authoring import ROOT, W, H, load_context, pack_garment, sha

BASELINE = "220ea2fd7588c1fe784c8454d66469d60fba096a"
ASSET = "docs/kling-side-expansion/assets/female-blouse.garment.zip"
EXPECTED_BASELINE_SHA = "c704a50b87e581c8b29fd24daee8b0d6d53f00667a94f71ea418e80decccc01d"
ART = ROOT / "artwork/kling-side-fitting/female-arm"
DOC = ROOT / "docs/kling-side-fitting/female-arm"
YY, XX = np.indices((H, W))


def unpack(data, ctx):
    """Reconstruct every actual V1 painting with binary overwrite semantics."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        manifest = json.loads(z.read("manifest.json"))
        assert manifest["sourceSha256"] == ctx.source_sha256
        assert manifest["registrationSha256"] == ctx.registration_sha256
        pages = [np.array(Image.open(io.BytesIO(z.read(p["file"]))).convert("RGBA")) for p in manifest["pages"]]
        masks = [np.array(Image.open(io.BytesIO(z.read(p["maskFile"]))).convert("RGBA"))[:, :, 3] > 0 for p in manifest["pages"]]
        frames = {}
        for e in manifest["frames"]:
            x, y, w, h = [e["rect"][k] for k in ["x", "y", "width", "height"]]
            a, b, page = e["offset"]["x"], e["offset"]["y"], e["page"]
            owned = masks[page][y:y+h, x:x+w]
            p = ctx.frames[e["frameId"]].copy()
            p[b:b+h, a:a+w][owned] = pages[page][y:y+h, x:x+w][owned]
            frames[e["frameId"]] = p
    assert set(frames) == set(ctx.frames)
    return manifest, frames


def polygon(points):
    mask = Image.new("L", (W * 3, H * 3))
    ImageDraw.Draw(mask).polygon([(round(x * 3), round(y * 3)) for x, y in points], fill=255)
    return np.array(mask.resize((W, H), Image.Resampling.LANCZOS))


def sample(pixels, target, controls):
    inverse = np.linalg.solve(np.column_stack([target, np.ones(3)]), controls)
    coords = (np.column_stack([XX.ravel(), YY.ravel(), np.ones(W*H)]) @ inverse).reshape(H, W, 2)
    a = pixels[:, :, 3].astype(float) / 255
    alpha = ndi.map_coordinates(a, [coords[:, :, 1], coords[:, :, 0]], order=1, mode="constant", cval=0)
    result = np.zeros((H, W, 4), np.uint8)
    for c in range(3):
        color = ndi.map_coordinates(pixels[:, :, c].astype(float) * a, [coords[:, :, 1], coords[:, :, 0]], order=1, mode="constant", cval=0)
        result[:, :, c] = np.clip(np.rint(color / np.maximum(alpha, 1e-8)), 0, 255).astype(np.uint8)
    result[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    result[alpha < .02] = 0
    return result


def composite_over(base, patch):
    a, oa = patch[:, :, 3:4] / 255, base[:, :, 3:4] / 255
    na = a + oa * (1-a)
    rgb = (patch[:, :, :3] * a + base[:, :, :3] * oa * (1-a)) / np.maximum(na, 1e-8)
    out = np.dstack((np.rint(rgb), np.rint(na[:, :, 0] * 255))).astype(np.uint8)
    result = base.copy()
    use = patch[:, :, 3] > 0
    result[use] = out[use]
    return result


def fit(ctx, before, sleeve, recipe):
    result = {fid: p.copy() for fid, p in before.items()}
    checks = []
    controls = np.array(recipe["donorControls"], float)
    for fid in ctx.animations["run"]["frames"]:
        points = ctx.registered[fid]["points"]
        point = lambda key: np.array([points[key]["x"], points[key]["y"]], float)
        sh, elbow, neck = point("nearShoulder"), point("nearElbow"), point("neck")
        cap = np.array([sh[0] + 4, neck[1] - 6])
        cuff = sh + (elbow-sh) * .75
        slope = np.clip(-(elbow[0]-sh[0]) / max(elbow[1]-sh[1], 20) * .55, -.2, .5)
        half = np.array([27, 27*slope])
        target = np.array(recipe["targetOverrides"].get(str(fid), [cap.tolist(), (cuff-half).tolist(), (cuff+half).tolist()]), float)
        patch = sample(sleeve, target, controls)
        original, m = ctx.frames[fid], ctx.masks(fid)
        seg = ctx.source_visible_segments(fid)["masks"]
        roi = (XX < max(sh[0], elbow[0])+40) & (YY > sh[1]-50) & (YY < elbow[1]+35)
        # This is a local source-ownership repair, not a global color operation:
        # restore existing source arm pixels near its registered segments where
        # the original torso-only affine painted over them. The generated
        # donor's skin is never used to replace the source arm.
        rgb = original[:, :, :3].astype(float)
        warm = (rgb[:, :, 0] > rgb[:, :, 1]+30) & (rgb[:, :, 1] > rgb[:, :, 2]+15) & (rgb[:, :, 0] > 90) & (original[:, :, 3] > 0)
        near = seg["nearUpperArm"] | seg["nearForearm"]
        skin = ndi.binary_dilation(warm & ndi.binary_dilation(near, iterations=4), iterations=1)
        restore = roi & (~m["top"] | skin) & ~m["bottom"] & ~m["shoes"] & np.any(before[fid] != original, axis=2)
        base = before[fid].copy()
        base[restore] = original[restore]
        foreground = ctx.protected_mask(fid) | ((seg["nearForearm"] | seg["farForearm"]) & ~m["top"])
        patch[foreground] = 0
        after = composite_over(base, patch)
        after[ctx.protected_mask(fid)] = original[ctx.protected_mask(fid)]
        changed = np.any(after != before[fid], axis=2)
        permitted = restore | (patch[:, :, 3] > 0)
        assert not (changed & ~permitted).any()
        assert not np.any(after != original, axis=2)[ctx.protected_mask(fid)].any()
        assert np.array_equal(after[~permitted], before[fid][~permitted])
        result[fid] = after
        ys, xs = np.where(changed)
        checks.append({"frameId": fid, "sourceFrame": ctx.registered[fid]["sourceFrame"], "targets": target.tolist(), "changedPixels": int(changed.sum()), "restoredSourcePixels": int((restore & np.all(after == original, axis=2)).sum()), "bounds": [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)], "protectedChanged": 0, "outsideLocalFitExact": True})
    return result, checks


def reviews(ctx, before, after, output):
    output.mkdir(parents=True, exist_ok=True)
    ids = [37, 38, 39, 40, 48, 49, 50, 51]
    board = Image.new("RGB", (400*len(ids), 440*2), (235,231,220))
    draw = ImageDraw.Draw(board)
    for row, (label, frames) in enumerate([("before", before), ("after", after)]):
        for col, fid in enumerate(ids):
            im = Image.fromarray(frames[fid]).crop((155,415,355,615)).resize((400,400), Image.Resampling.NEAREST)
            board.paste(im, (col*400, row*440+40), im)
            draw.text((col*400+8,row*440+10),f"{label} / pack {fid} / integer 2x",fill=(20,30,30))
    board.save(output / "cuff-details-2x.png")
    clip = ctx.animations["run"]
    for facing in ["right", "left"]:
        pictures=[]
        for fid in clip["frames"]:
            p = Image.new("RGB", (512,408), (235,231,220)); d=ImageDraw.Draw(p)
            for col, (label, frames) in enumerate([("before", before), ("after", after)]):
                im=Image.fromarray(frames[fid])
                if facing=="left": im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                im=im.resize((256,384),Image.Resampling.LANCZOS);p.paste(im,(col*256,24),im)
                d.text((col*256+8,6),f"{label} / run {fid} / {facing}",fill=(20,30,30))
            pictures.append(p)
        sheet=Image.new("RGB",(512,408*len(pictures)))
        for i,p in enumerate(pictures):sheet.paste(p,(0,i*408))
        palette=sheet.quantize(colors=256)
        indexed=[p.quantize(palette=palette,dither=Image.Dither.NONE) for p in pictures]
        timing=[round((i+1)*100/clip["fps"])*10-round(i*100/clip["fps"])*10 for i in range(len(pictures))]
        path=output/f"run-top-compositor-{facing}.gif"
        indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=timing,loop=0,disposal=2,optimize=False)
        with Image.open(path) as im:
            got=[]
            for i in range(im.n_frames):im.seek(i);im.load();got.append(im.info["duration"])
            assert got==timing and im.info["loop"]==0


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",type=Path,default=ROOT/ASSET)
    ap.add_argument("--review",type=Path,default=DOC)
    args=ap.parse_args()
    recipe=json.loads((ART/"sleeve-fit.json").read_text())
    raw=(ROOT/recipe["donorFile"]).read_bytes();assert sha(raw)==recipe["donorSha256"]
    ctx=load_context("female",registration_path=ROOT/"artwork/kling-side-expansion/templates/female.registration.json")
    assert ctx.registration_sha256==recipe["registrationSha256"] and ctx.source_sha256==recipe["sourceSha256"]
    baseline=subprocess.run(["git","show",f"{BASELINE}:{ASSET}"],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout
    assert sha(baseline)==EXPECTED_BASELINE_SHA
    manifest,before=unpack(baseline,ctx)
    sleeve=np.array(Image.open(io.BytesIO(raw)).convert("RGBA").resize((1024,768),Image.Resampling.LANCZOS))[:,:512].copy()
    sleeve[:,:,3]=polygon(recipe["sleeveOutline"])
    # Trim the donor's skin below the drawn cuff; the rule is confined to the
    # hand-traced cuff edge. Warm shadow folds elsewhere remain untouched.
    rgb=sleeve[:,:,:3].astype(float)
    trim=(YY>=436)&(rgb[:,:,0]>rgb[:,:,1]+60)&(rgb[:,:,1]>rgb[:,:,2]+20)&(rgb[:,:,0]>160)
    sleeve[trim,3]=0;sleeve[sleeve[:,:,3]==0]=0
    ART.mkdir(parents=True,exist_ok=True);Image.fromarray(sleeve).save(ART/"near-puff-sleeve.png")
    after,checks=fit(ctx,before,sleeve,recipe)
    untouched=[fid for fid in before if np.array_equal(before[fid],after[fid])]
    assert len(untouched)==84 and set(untouched).isdisjoint(ctx.animations["run"]["frames"])
    provenance=manifest["provenance"]+" Follow-up: near puff sleeve and cuff isolated from the existing forward donor and fitted independently through all 18 running poses. Original source arm released from erroneous local cloth ownership, existing torso/neckline fit retained. No new painted body, source warp, retiming, registration change or runtime AI. Reproduce with scripts/polish-kling-side-female-sleeves.py."
    audit=pack_garment(ctx,manifest["id"],manifest["name"],"top",after,args.output,provenance)
    _,roundtrip=unpack(args.output.read_bytes(),ctx)
    assert all(np.array_equal(after[f],roundtrip[f]) for f in after)
    reviews(ctx,before,after,args.review)
    report={"baselineCommit":BASELINE,"baselineSha256":EXPECTED_BASELINE_SHA,"finalSha256":sha(args.output.read_bytes()),"sourceSha256":ctx.source_sha256,"registrationSha256":ctx.registration_sha256,"changedFrames":checks,"unchangedFrames":untouched,"reconstructedFrameCount":len(after),"roundtripExact":True,"protectedChanged":0,"sourceTimingUnchanged":True,"sleeveSha256":sha((ART/"near-puff-sleeve.png").read_bytes()),"limits":"Offline garment-compositor diagnostic, not actual UI export acceptance. Far sleeve and torso donor changes remain; no soft cloth simulation. Main lower-forearm notch belongs to skirt ownership and is repaired separately."}
    args.review.mkdir(parents=True,exist_ok=True)
    (args.review/"audit.json").write_text(json.dumps(report,indent=2)+"\n")
    (args.review/"pack-audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    print(json.dumps({"sha256":report["finalSha256"],"changed":len(checks),"unchanged":len(untouched),"protectedChanged":0,"roundtripExact":True}))


if __name__=="__main__":main()
