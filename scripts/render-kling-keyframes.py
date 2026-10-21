"""Render comparisons from real candidate/source CharacterPacks, not concept art.

GIFs are palette-limited display copies on a neutral checker. Native compact
packs retain exact RGBA; every tick/hold and the loop extension is verified.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("compiler", ROOT / "scripts/compile-kling-keyframes.py")
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)
ACTIONS = compiler.ACTIONS
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size=15):
    return ImageFont.truetype(FONT, size)


def checker(size):
    image = Image.new("RGB", size, "#f3f0e7")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], 24):
        for x in range(0, size[0], 24):
            if (x // 24 + y // 24) % 2:
                draw.rectangle((x, y, x + 23, y + 23), fill="#e8e8dd")
    return image


def display(frame, scale, facing="right"):
    if facing == "left":
        frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return frame.resize((round(704 * scale), round(1056 * scale)), Image.Resampling.LANCZOS) if scale != 1 else frame


def features(frame):
    a = np.asarray(frame.resize((176, 264), Image.Resampling.BOX), dtype=np.float32) / 255
    a[:, :, :3] *= a[:, :, 3:4]
    return a


def distance(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def diagnostics(frames, keys, original_ids):
    ids = [key["frameId"] for key in keys]
    data = {i: features(frames[i]) for i in set(ids + original_ids)}
    selected = [distance(data[a], data[b]) for a, b in zip(ids, ids[1:] + ids[:1])]
    old = [distance(data[a], data[b]) for a, b in zip(original_ids, original_ids[1:] + original_ids[:1])]
    # A pixel diagnostic, explicitly not an anatomical foot-lock/naturalness score.
    return {"metric": "RMSE of quarter-size premultiplied RGB+alpha, same fixed canvas",
            "selectedTransitions": selected, "selectedWrap": selected[-1],
            "selectedMeanInternal": float(np.mean(selected[:-1])),
            "selectedWrapVsMeanInternal": selected[-1] / max(float(np.mean(selected[:-1])), 1e-9),
            "originalForcedWrap": old[-1], "originalMeanInternal": float(np.mean(old[:-1])),
            "note": "Pose and motion phase were inspected separately; a small image difference alone cannot prove a good loop. Original jump is a one-shot, so its forced wrap is diagnostic only."}


def save_gif(images, durations, path):
    # One shared palette avoids frame-dependent color flicker in the review copy.
    palette_sheet = Image.new("RGB", (images[0].width // 2, images[0].height // 2 * len(images)))
    for i, image in enumerate(images):
        palette_sheet.paste(image.resize((image.width // 2, image.height // 2)), (0, i * (image.height // 2)))
    palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        assert gif.info["loop"] == 0 and gif.n_frames == len(images)
        times = []
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.convert("RGB").load()
            times.append(gif.info["duration"])
        assert times == durations
    return {"file": path.name, "frames": len(images), "durationsMs": durations,
            "durationMs": sum(durations), "loop": True, "decoded": True,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def comparison(identity, action, old_frames, candidate_frames, baseline, clip, out, facing):
    assert len(baseline) == len(clip["frames"])
    w, h = 352, 528
    images = []
    for tick, (old_id, new_id) in enumerate(zip(baseline, clip["frames"])):
        image = checker((w * 2, h + 100))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, image.width, 81), fill="#f3f0e7")
        draw.text((12, 8), f"{identity} / {action} / {facing} / 0.5x / in place", font=font(17), fill="#30453b")
        reference = "Source hop range (trimmed)" if action == "jump" else "Original source cycle"
        for col, (sprite, label, frame_id) in enumerate([(old_frames[old_id], reference, old_id), (candidate_frames[new_id], "Selected keyframes + holds", new_id)]):
            draw.text((col * w + 12, 36), label, font=font(14), fill="#48584b")
            draw.text((col * w + 12, 59), f"tick {tick+1}/{len(baseline)} | frame {frame_id}", font=font(13), fill="#48584b")
            sprite = display(sprite, .5, facing)
            image.paste(sprite, (col * w, 82), sprite)
            y = 82 + 998 * .5
            draw.line((col*w+8, y, (col+1)*w-8, y), fill="#9ca893", width=1)
        draw.text((12, h+84), "Original RGBA unchanged in pack; GIF colors/scale are preview-only.", font=font(12), fill="#48584b")
        images.append(image)
    durations = [round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(len(images))]
    result = save_gif(images, durations, out/f"{identity}-{action}-{facing}.gif")
    result.update(character=identity, action=action, facing=facing, scale=.5,
                  sourceTickCount=len(baseline), candidateDistinctFrames=len(set(clip["frames"])),
                  baseline="trimmed chronological hop" if action == "jump" else "original full cycle")
    assert abs(sum(durations)-len(images)*1000/24) <= 5
    return result


def key_sheet(identity, action, frames, keys, out):
    w, h, cols = 176, 264, min(8, len(keys))
    image = checker((w*cols, (h+60)*math.ceil(len(keys)/cols)))
    draw = ImageDraw.Draw(image)
    for index, key in enumerate(keys):
        x, y = index % cols*w, index//cols*(h+60)
        sprite = display(frames[key["frameId"]], .25)
        image.paste(sprite, (x, y+60), sprite)
        draw.rectangle((x,y,x+w-1,y+59),fill="#f3f0e7")
        draw.text((x+5,y+4),f"{identity} / {action} / {index+1}",font=font(12),fill="#30453b")
        draw.text((x+5,y+22),f"source {key['sourceFrame']} | id {key['frameId']}",font=font(12),fill="#30453b")
        draw.text((x+5,y+40),f"hold {key['ticks']}/24 s",font=font(12),fill="#30453b")
    path=out/f"{identity}-{action}-keys.png"
    image.save(path)


def native_wrap(identity, frames, old_ids, selected, out):
    ids = [key["frameId"] for key in selected]
    # The full old one-shot is shown as a rejected forced loop, not relabeled looping.
    rows = [[old_ids[-2], old_ids[-1], old_ids[0], old_ids[1]], [ids[-2], ids[-1], ids[0], ids[1]]]
    image=checker((704*4,(1056+60)*2))
    draw=ImageDraw.Draw(image)
    for row, values in enumerate(rows):
        for col, frame_id in enumerate(values):
            x,y=col*704,row*1116
            sprite=frames[frame_id]
            image.paste(sprite,(x,y+60),sprite)
            draw.rectangle((x,y,x+703,y+59),fill="#f3f0e7")
            label="Original one-shot FORCED wrap" if row==0 else "Repeated-hop candidate wrap"
            draw.text((x+10,y+8),f"{identity} / {label} / native 1x",font=font(20),fill="#30453b")
            draw.text((x+10,y+33),f"frame {frame_id} / {'end' if col<2 else 'begin'}",font=font(18),fill="#30453b")
    image.save(out/f"{identity}-jump-wrap-1x.png")


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,default=ROOT/"docs/kling-keyframes/review")
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    profile=json.loads((ROOT/"artwork/kling-keyframes/selection.json").read_text())
    report={"format":"gathria-kling-keyframe-media","version":1,"source":"Actual candidate and original CharacterPack frame rectangles; no concept images",
            "gifNote":"Same fixed canvas/anchor; palette-limited 0.5x neutral-background copies. Native packs retain exact source RGBA.","animations":[],"diagnostics":[],"media":[]}
    for identity in ["male","female"]:
        data=profile["characters"][identity]
        _,old,_,source=compiler.source_frames(ROOT/data["sourcePack"])
        pack_bytes,manifest,_,candidate=compiler.source_frames(ROOT/f"docs/kling-keyframes/exports/{identity}.character.zip")
        for frame_id,frame in candidate.items():assert frame.tobytes()==source[frame_id].tobytes()
        for action in ACTIONS:
            selected=data["actions"][action]
            key_sheet(identity,action,candidate,selected["keys"],args.output)
            for facing in ["right","left"]:
                report["animations"].append(comparison(identity,action,source,candidate,selected["baselineFrameIds"],manifest["animations"][action],args.output,facing))
            report["diagnostics"].append({"character":identity,"action":action,**diagnostics(source,selected["keys"],old["animations"][action]["frames"])})
        native_wrap(identity,source,old["animations"]["jump"]["frames"],data["actions"]["jump"]["keys"],args.output)
        for frames in [source,candidate]:
            for image in frames.values():image.close()
    for path in sorted(args.output.glob("*")):
        if path.suffix not in [".png",".gif"]:continue
        with Image.open(path) as image:
            count=getattr(image,"n_frames",1)
            for i in range(count):image.seek(i);image.load()
            report["media"].append({"file":path.name,"dimensions":list(image.size),"frames":count,"decoded":True,"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    report["passed"]=True
    (args.output/"media-validation.json").write_bytes(compiler.json_bytes(report))
    print(json.dumps({"gifs":len(report['animations']),"media":len(report['media']),"passed":True}))


if __name__=="__main__":main()
