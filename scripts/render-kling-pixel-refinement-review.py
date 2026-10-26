"""Arrange actual exported pixels; never redraw poses or change their clocks.

Smooth columns use the declared global grid projection for display only. Pixel
columns use integer nearest-neighbor enlargement. Original downloadable files
remain untouched. Authored-storybook references are explicitly different art.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
MATTE = (240, 237, 226)
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
TITLE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Pack:
    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        self.manifest = json.loads(self.zip.read("manifest.json"))
        self.frames = {f["id"]: f for f in self.manifest["frames"]}
        self.sheets = [self.manifest["spritesheet"], *self.manifest.get("additionalSheets", [])]
        self.cached = None
        self.image = None

    def frame(self, frame_id):
        f = self.frames[frame_id]
        page = f.get("page", 0)
        if self.cached != page:
            if self.image:
                self.image.close()
            self.image = Image.open(io.BytesIO(self.zip.read(self.sheets[page]["file"]))).convert("RGBA")
            self.cached = page
        return self.image.crop((f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"]))

    def close(self):
        if self.image:
            self.image.close()
        self.zip.close()


def padded_source(image, mapping):
    f = mapping["factor"]
    surface = Image.new("RGBA", (mapping["width"] * f, mapping["height"] * f))
    surface.paste(image, (mapping["padding"]["left"], mapping["padding"]["top"]))
    return surface


def display(image, zoom=2, smooth_source=None):
    result = Image.new("RGB", (image.width * zoom, image.height * zoom), MATTE)
    enlarged = (smooth_source.resize(result.size, Image.Resampling.LANCZOS)
                if smooth_source is not None else image.resize(result.size, Image.Resampling.NEAREST))
    result.paste(enlarged, (0, 0), enlarged)
    return result


def panels(images, labels, title, footer="", zoom=2, smooth_sources=None):
    width = max(i.width for i in images) * zoom
    height = max(i.height for i in images) * zoom
    board = Image.new("RGB", (width * len(images), height + 82), MATTE)
    d = ImageDraw.Draw(board)
    d.text((12, 7), title, fill=(42, 53, 46), font=TITLE)
    for n, (im, label) in enumerate(zip(images, labels)):
        d.text((width * n + 12, 34), label, fill=(65, 68, 62), font=FONT)
        board.paste(display(im, zoom, (smooth_sources or {}).get(n)), (width * n, 57))
    d.text((12, height + 61), footer, fill=(80, 82, 75), font=FONT)
    return board


def save_gif(path, frames, fps, loop):
    # One palette for the complete presentation, no per-frame GIF color fitting.
    sample = Image.new("RGB", (128 * len(frames), 128), MATTE)
    for n, frame in enumerate(frames):
        thumb = frame.copy()
        thumb.thumbnail((128, 128))
        sample.paste(thumb, (n * 128, 0))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    encoded = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    delays = [int((int((i + 1) * 100 / fps + .5) - int(i * 100 / fps + .5)) * 10) for i in range(len(frames))]
    encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=delays,
                    disposal=1, optimize=False, **({"loop": 0} if loop else {}))
    with Image.open(path) as gif:
        assert gif.n_frames == len(frames)
        durations = []
        for f in ImageSequence.Iterator(gif):
            f.load()
            durations.append(f.info["duration"])
        assert sum(durations) == sum(delays)
        assert (gif.info.get("loop") == 0) == loop


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="final-v1")
    parser.add_argument("--output", default="docs/kling-pixel-refinement/review")
    args = parser.parse_args()
    evidence_path = ROOT / "docs/kling-pixel-refinement/evidence" / args.run / "evidence-index.json"
    evidence = json.loads(evidence_path.read_text())
    assert evidence["passed"], "Use completed production capture"
    out = ROOT / args.output
    assert not out.exists() or not any(out.iterdir()), "Retain previous galleries"
    out.mkdir(parents=True, exist_ok=True)
    outputs = []
    index = {
        "format": "gathria-pixel-refinement-review", "version": 1,
        "evidenceIndex": str(evidence_path.relative_to(ROOT)),
        "evidenceSha256": digest(evidence_path), "scriptSha256": digest(Path(__file__)),
        "provenance": "All character pixels come from actual application-exported packs. Smooth references use a labeled fixed display projection; candidate pixels use integer enlargement. No per-pose fitting or retiming.",
        "files": outputs,
    }

    def record(path, **metadata):
        with Image.open(path) as im:
            info = {"width": im.width, "height": im.height, "frames": getattr(im, "n_frames", 1)}
            for f in ImageSequence.Iterator(im):
                f.load()
        outputs.append({"file": path.name, "sha256": digest(path), "bytes": path.stat().st_size, **info, **metadata})

    for item in evidence["builds"]:
        key = item["case"]
        source_path, pixel_path = ROOT / item["sourcePack"]["file"], ROOT / item["pixelPack"]["file"]
        assert digest(source_path) == item["sourcePack"]["sha256"]
        assert digest(pixel_path) == item["pixelPack"]["sha256"]
        mapping = json.loads((ROOT / item["buildReport"]["file"]).read_text())["mapping"]
        source, pixel = Pack(source_path), Pack(pixel_path)
        assert source.manifest["animations"] == pixel.manifest["animations"]
        run = pixel.manifest["animations"]["run"]
        originals = [padded_source(source.frame(i), mapping) for i in run["frames"]]
        pairs = [(original.resize((mapping["width"], mapping["height"]), Image.Resampling.LANCZOS), pixel.frame(i))
                 for original, i in zip(originals, run["frames"])]
        for direction in ["right", "left"]:
            frames = []
            for n, pair in enumerate(pairs):
                images = list(pair) if direction == "right" else [i.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for i in pair]
                original = originals[n] if direction == "right" else originals[n].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                frames.append(panels(images, ["Current outfit · smooth display reference", "Pixel finish · actual converted pixels"],
                                     f"{key} / run {direction} / 2x / in place",
                                     f"Same source pose {run['frames'][n]} | {run['fps']:g} FPS | original timing", smooth_sources={0: original}))
            path = out / f"{key}-run-comparison-{direction}-2x.gif"
            save_gif(path, frames, run["fps"], run["loop"])
            record(path, case=key, action="run", facing=direction, presentationOnly=True)
        chosen = [0, len(pairs)//4, len(pairs)//2, len(pairs)*3//4]
        images = [im for position in chosen for im in pairs[position]]
        labels = [text for p in chosen for text in [f"Smooth / pos {p}", f"Pixel / pos {p}"]]
        for zoom in [1, 2]:
            path = out / f"{key}-run-keyframes-{zoom}x.png"
            panels(images, labels, f"{key} / same poses / {zoom}x", "Smooth columns scaled directly from the original; pixel columns use integer enlargement.", zoom,
                   smooth_sources={n*2: originals[p] for n,p in enumerate(chosen)}).save(path)
            record(path, case=key, zoom=zoom, presentationOnly=True)
        pose = pairs[0]
        bounds = pose[1].getbbox()
        top = max(0, bounds[1] - 4)
        crop = (max(0, bounds[0]-5), top, min(mapping["width"], bounds[2]+5), min(mapping["height"], top + round((bounds[3]-bounds[1])*.5)))
        path = out / f"{key}-head-4x.png"
        panels([im.crop(crop) for im in pose], ["Smooth display reference", "Pixel finish · 128-color bank"], f"{key} / same head crop / 4x", "Fixed crop from run pose 0; no independent face alignment.", 4,
               smooth_sources={0: originals[0].crop(tuple(v*mapping["factor"] for v in crop))}).save(path)
        record(path, case=key, crop=crop, presentationOnly=True)

        # Earlier authored theme art is a separate style reference, never labeled
        # a same-frame rendering of this current wardrobe configuration.
        if key.endswith("wedding"):
            gender = key.split("-")[0]
            old_path = ROOT / f"docs/kling-themes/bundles/{gender}-pixel-storybook-v2-wedding.character.zip"
            old = Pack(old_path)
            old_run = old.manifest["animations"]["run"]
            assert abs(len(old_run["frames"])/old_run["fps"] - len(run["frames"])/run["fps"]) < 1e-9
            anchors = [mapping["anchor"], old.manifest["anchor"], mapping["anchor"]]
            sizes = [(mapping["width"], mapping["height"]), (old.manifest["spritesheet"]["frameWidth"], old.manifest["spritesheet"]["frameHeight"]), (mapping["width"],mapping["height"])]
            left = max(a["x"] for a in anchors); top = max(a["y"] for a in anchors)
            width = left + max(w-a["x"] for (w,h),a in zip(sizes,anchors))
            height = top + max(h-a["y"] for (w,h),a in zip(sizes,anchors))
            frames=[]
            for n,pair in enumerate(pairs):
                old_id = old_run["frames"][min(len(old_run["frames"])-1, int(n/run["fps"]*old_run["fps"]))]
                placed=[]
                for im,a in zip([pair[0],old.frame(old_id),pair[1]],anchors):
                    canvas=Image.new("RGBA",(width,height));canvas.paste(im,(left-a["x"],top-a["y"]));placed.append(canvas)
                f=mapping["factor"]
                smooth=Image.new("RGBA",(width*f,height*f))
                smooth.paste(originals[n],((left-anchors[0]["x"])*f,(top-anchors[0]["y"])*f))
                frames.append(panels(placed,["Current smooth · display scaled", "Storybook R2 · DIFFERENT authored art", "New algorithmic pixel candidate"],f"{key} / style comparison / 2x", "Same cycle duration; Storybook has different poses, face, clothes and frame count.",smooth_sources={0:smooth}))
            path=out/f"{key}-three-styles-right-2x.gif"
            save_gif(path,frames,run["fps"],True)
            record(path,case=key,presentationOnly=True,authoredReference=str(old_path.relative_to(ROOT)),authoredReferenceSha256=digest(old_path))
            old.close()
        source.close();pixel.close()
        print(key, "review rendered", flush=True)
    (out/"index.json").write_text(json.dumps(index,indent=2)+"\n")
    cards="\n".join(f'<figure><a href="{x["file"]}"><img loading="lazy" src="{x["file"]}" alt="{x["file"]}"></a><figcaption>{x["file"]}</figcaption></figure>' for x in outputs)
    (out/"index.html").write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kling pixel finish review</title><style>body{font:16px system-ui;background:#f4f1e8;color:#283c32;margin:24px}figure{margin:24px 0}img{max-width:100%;height:auto}figcaption{margin:8px 0}a{color:inherit}</style><h1>Kling pixel finish candidate</h1><p>Actual exported artwork. Smooth references are scaled for display; pixel previews use integer enlargement. Storybook references are different authored art. Original timing is retained. Fine seams and source motion blur remain.</p>'+cards)


if __name__ == "__main__":
    main()
