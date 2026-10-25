#!/usr/bin/env python3
"""Arrange completed browser downloads into a compact, traceable visual review.

This does not author character pixels or create application-export evidence.
The comparisons are offline presentation derivatives; the original UI downloads
remain beside the capture manifest and are linked from the review page.
"""

import argparse
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = ROOT / "docs/kling-expression-shirt/evidence/final-v1/evidence-index.json"
DEFAULT_SUPPLEMENT = ROOT / "docs/kling-expression-shirt/evidence/recommended-v1/evidence-index.json"
DEFAULT_OUTPUT = ROOT / "docs/kling-expression-shirt/review"
MATTE = (238, 233, 223)
INK = (36, 38, 43)
HAIR = {"male": "airy-tousle", "female": "ribbon-pony"}
# Native export coordinates, including the exported 32px left / 128px top pad.
# These fixed review crops include both eyes, ears, nose and mouth at frame 0.
FACE_CROPS = {"male": (180, 385, 610, 680), "female": (175, 365, 610, 665)}
MAX_BYTES = 20 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(path):
    return str(path.resolve().relative_to(ROOT))


def font(size=18):
    for path in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def opaque(image):
    result = Image.new("RGBA", image.size, MATTE + (255,))
    result.alpha_composite(image.convert("RGBA"))
    return result.convert("RGB")


class Review:
    def __init__(self, index_path, output, supplement_path=None):
        self.index_path, self.output = index_path, output
        self.index_bytes = index_path.read_bytes()
        self.capture = json.loads(self.index_bytes)
        require(self.capture.get("passed") is True and self.capture.get("finishedAt"),
                "Refuse incomplete capture: passed=true and finishedAt are required.")
        require(self.capture.get("mode") == "final-looks" and self.capture.get("production") is True,
                "Expected completed production final-looks capture.")
        require(len(self.capture["matrix"]) == 24 and len(self.capture["packs"]) == 5
                and len(self.capture["gifs"]) == 24 and len(self.capture["playback"]) == 50,
                "Expected both characters, four day/wedding looks, and the new shirt.")
        self.downloads = {Path(row["file"]).name: row for row in self.capture["downloads"]}
        require(len(self.downloads) == len(self.capture["downloads"]), "Duplicate download basenames.")
        self.download_origins = {name: relative(index_path) for name in self.downloads}
        self.gif_rows = {Path(row["file"]).name: row for row in self.capture["gifs"]}
        self.packs = {row["key"]: row for row in self.capture["packs"]}
        self.supplement = None
        self.supplement_provenance = None
        if supplement_path is not None:
            supplement_bytes = supplement_path.read_bytes()
            self.supplement = json.loads(supplement_bytes)
            require(self.supplement.get("passed") is True and self.supplement.get("finishedAt"),
                    "Refuse incomplete supplemental capture: passed=true and finishedAt are required.")
            require(self.supplement.get("mode") == "current-recommended-outfits" and self.supplement.get("production") is True,
                    "Expected production current-recommended-outfits supplement.")
            require(len(self.supplement["matrix"]) == 4 and len(self.supplement["gifs"]) == 4
                    and len(self.supplement["downloads"]) == 16
                    and not self.supplement["packs"] and not self.supplement["projects"] and not self.supplement["playback"],
                    "Expected four recommended looks with twelve PNGs and four GIFs, without pack/project/playback claims.")
            require(len({(row["character"], row["presetId"]) for row in self.supplement["matrix"]}) == 4,
                    "Duplicate recommended-look identity.")
            for field in ["errors", "consoleErrors", "failedRequests", "externalRequests", "independentEditorRequests"]:
                require(self.supplement[field] == [], f"Supplemental browser failures: {field}")
            for row in self.supplement["downloads"]:
                basename = Path(row["file"]).name
                require(basename not in self.downloads, "Supplement duplicates a main download basename.")
                self.downloads[basename] = row
                self.download_origins[basename] = relative(supplement_path)
            self.gif_rows.update({Path(row["file"]).name: row for row in self.supplement["gifs"]})
            self.supplement_provenance = {"captureIndex": relative(supplement_path),
                                          "captureIndexSha256": sha(supplement_bytes),
                                          "captureFinishedAt": self.supplement["finishedAt"],
                                          "scope": "Links to actual PNG/run-right GIF downloads of the recorded current recommended presets. This supplement has no saved projects, CharacterPacks, or standalone playback observations."}
        self.sources = {}
        self.outputs = []
        self.link_groups = []
        self.supplement_link_groups = []
        self.output.mkdir(parents=True, exist_ok=True)

    def source(self, basename):
        row = self.downloads[basename]
        require(row.get("actualUiDownload") is True, f"Not a UI download: {basename}")
        path = (ROOT / row["file"]).resolve()
        path.relative_to(ROOT)
        data = path.read_bytes()
        require(len(data) == row["bytes"] and sha(data) == row["sha256"], f"Capture bytes changed: {basename}")
        self.sources[basename] = {
            "file": row["file"], "sha256": row["sha256"], "bytes": row["bytes"],
            "kind": row["kind"], "actualUiDownload": True,
            "captureIndex": self.download_origins[basename],
        }
        return path

    def png(self, basename):
        with Image.open(self.source(basename)) as image:
            require(image.format == "PNG", f"Not PNG: {basename}")
            image.load()
            return opaque(image)

    def gif(self, basename):
        frames, delays = [], []
        with Image.open(self.source(basename)) as image:
            require(image.format == "GIF", f"Not GIF: {basename}")
            loop = image.info.get("loop")
            for i in range(image.n_frames):
                image.seek(i)
                frames.append(image.convert("RGB"))
                delays.append(image.info.get("duration", 0))
        row = self.gif_rows[basename]
        require(delays == row["delaysMs"] and len(frames) == row["frames"], f"GIF timing differs: {basename}")
        require((loop == 0) == row["loop"], f"GIF looping differs: {basename}")
        return frames, delays, loop

    def record(self, path, sources, **metadata):
        with Image.open(path) as image:
            for i in range(getattr(image, "n_frames", 1)):
                image.seek(i)
                image.load()
            dimensions = list(image.size)
        self.outputs.append({"file": relative(path), "sha256": sha(path.read_bytes()),
                             "bytes": path.stat().st_size, "dimensions": dimensions,
                             "actualUiDownload": False,
                             "kind": "offline-review-arrangement", "sources": sources, **metadata})

    def comparison(self, filename, title, panels):
        """Join actual GIF frames without resampling; shared review palette only."""
        decoded = [self.gif(basename) for _, basename in panels]
        first_frames, delays, loop = decoded[0]
        require(all(item[1:] == (delays, loop) for item in decoded), "Comparison GIF clocks differ.")
        size = first_frames[0].size
        require(all(frame.size == size for frames, _, _ in decoded for frame in frames), "Panel sizes differ.")
        width, height = size
        margin, gutter, title_height, label_height = 12, 10, 38, 32
        output_size = (margin * 2 + width * len(panels) + gutter * (len(panels) - 1),
                       title_height + label_height + height + 12)
        frames = []
        for position in range(len(first_frames)):
            canvas = Image.new("RGB", output_size, MATTE)
            draw = ImageDraw.Draw(canvas)
            draw.text((margin, 8), title, fill=INK, font=font(19))
            for column, (label, _) in enumerate(panels):
                x = margin + column * (width + gutter)
                draw.text((x + 4, title_height + 4), label, fill=INK, font=font(17))
                canvas.paste(decoded[column][0][position], (x, title_height + label_height))
            frames.append(canvas)
        # One palette sampled across the complete comparison avoids an extra
        # frame-to-frame palette change in this presentation derivative.
        samples = [frame.resize((max(1, frame.width // 4), max(1, frame.height // 4)), Image.Resampling.BOX)
                   for frame in frames]
        sample = Image.new("RGB", (samples[0].width, sum(item.height for item in samples)), MATTE)
        y = 0
        for item in samples:
            sample.paste(item, (0, y))
            y += item.height
        palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        path = self.output / filename
        options = {"loop": loop} if loop is not None else {}
        indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=delays,
                        disposal=1, optimize=False, **options)
        with Image.open(path) as check:
            observed_delays = []
            for i in range(check.n_frames):
                check.seek(i)
                observed_delays.append(check.info["duration"])
            require(observed_delays == delays, "Review GIF changed frame count/timing.")
        self.record(path, [name for _, name in panels], title=title, panels=[label for label, _ in panels],
                    scaleFromDownloadedGif=1, scaleFromNativeExport=0.5,
                    frames=len(frames), delaysMs=delays, loop=loop,
                    colorNote="Decoded original GIF pixels arranged at 1:1, then requantized to one shared 256-color presentation palette. Open linked originals for unchanged export bytes.")

    def faces(self, scale):
        rows, used = [], []
        labels = [("Current Natural", "natural"), ("Gentle", "gentle"), ("Joyful", "joyful")]
        for character in ["male", "female"]:
            crops = []
            for label, face in labels:
                basename = f"{character}-day-{HAIR[character]}-{face}-idle-0-right.png"
                crop = self.png(basename).crop(FACE_CROPS[character])
                if scale != 1:
                    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST)
                crops.append((label, crop))
                used.append(basename)
            rows.append((character, crops))
        margin, gutter, title_height, label_height = 14, 12, 46, 32
        cell_width = max(crop.width for _, crops in rows for _, crop in crops)
        cell_height = max(crop.height for _, crops in rows for _, crop in crops)
        canvas = Image.new("RGB", (margin * 2 + 3 * cell_width + 2 * gutter,
                                    title_height + 2 * (cell_height + label_height + gutter)), MATTE)
        draw = ImageDraw.Draw(canvas)
        draw.text((margin, 10), f"Frame 0 / native face crops at {scale}x / actual PNG downloads", fill=INK, font=font(20))
        for row, (character, crops) in enumerate(rows):
            y = title_height + row * (cell_height + label_height + gutter)
            for column, (label, crop) in enumerate(crops):
                x = margin + column * (cell_width + gutter)
                draw.text((x, y), f"{character.title()} · {label}", fill=INK, font=font(17))
                canvas.paste(crop, (x, y + label_height))
        path = self.output / f"expression-faces-{scale}x.png"
        canvas.save(path, optimize=True)
        self.record(path, used, scaleFromNativeExport=scale, sourceFrameId=0,
                    cropCoordinates=FACE_CROPS, resize="none" if scale == 1 else "nearest-neighbor",
                    matte=list(MATTE), hair=HAIR,
                    note="PNG alpha composited on a neutral matte; no character-pixel retouching.")

    def shirt_contact(self):
        poses = [("idle", 0), ("run", 55), ("jump", 86), ("celebrate", 78)]
        width, height, header, label, margin, gutter = 256, 395, 48, 48, 14, 10
        canvas = Image.new("RGB", (2 * margin + 4 * width + 3 * gutter,
                                   header + 2 * (label + height + gutter)), MATTE)
        draw, used = ImageDraw.Draw(canvas), []
        draw.text((margin, 10), "Midnight sailor shirt / captured pants combinations / PNG keyframes at 1/3 size", fill=INK, font=font(20))
        for row, pants in enumerate(["default", "mixed"]):
            for column, (action, frame_id) in enumerate(poses):
                basename = f"male-midnight-sailor-{pants}-{action}-{frame_id}-right.png"
                image = self.png(basename)
                require(image.size == (768, 1184), "Unexpected native male PNG geometry.")
                image = image.resize((width, height), Image.Resampling.LANCZOS)
                x, y = margin + column * (width + gutter), header + row * (label + height + gutter)
                pants_label = "Everyday" if pants == "default" else "Mixed"
                draw.text((x, y), f"{pants_label} pants · {action}", fill=INK, font=font(16))
                draw.text((x, y + 21), f"Native frame {frame_id}", fill=INK, font=font(14))
                canvas.paste(image, (x, y + label))
                used.append(basename)
        path = self.output / "midnight-sailor-keyframes.png"
        canvas.save(path, optimize=True)
        self.record(path, used, scaleFromNativeExport={"x": width / 768, "y": height / 1184},
                    resize="lanczos", matte=list(MATTE), sourceFrameIds=[item[1] for item in poses],
                    note="Both pants combinations are static PNG downloads; animation below uses the pants from the retained Everyday preset, not a claim about newest recommended wardrobe defaults.")

    def links(self):
        for character in ["male", "female"]:
            for look in ["day", "wedding"]:
                key = f"{character}-{look}-joyful"
                links = []
                for action, facing in [("run", "right"), ("run", "left"), ("jump", "right"), ("celebrate", "right")]:
                    basename = f"{key}-{action}-{facing}.gif"
                    self.source(basename)
                    links.append({"label": f"{action} {facing}", "source": basename})
                pack_name = key + ".character.zip"
                self.source(pack_name)
                links.append({"label": "All five actions · CharacterPack", "source": pack_name})
                preset = "Everyday" if look == "day" else "Wedding"
                self.link_groups.append({"label": f"{character.title()} / retained {preset} preset / Joyful",
                                         "captureKey": key, "capturedPreset": preset,
                                         "selection": self.packs[key]["selection"], "links": links})
        key = "male-midnight-sailor-joyful"
        links = []
        for action, facing in [("run", "right"), ("run", "left"), ("jump", "right"), ("celebrate", "right")]:
            basename = f"{key}-{action}-{facing}.gif"
            self.source(basename)
            links.append({"label": f"{action} {facing}", "source": basename})
        self.source(key + ".character.zip")
        links.append({"label": "All five actions · CharacterPack", "source": key + ".character.zip"})
        self.link_groups.append({"label": "Midnight sailor / retained Everyday pants / Joyful",
                                 "captureKey": key, "selection": self.packs[key]["selection"], "links": links})

    def supplement_links(self):
        if self.supplement is None:
            return
        for row in self.supplement["matrix"]:
            require(row["faceId"] == "joyful" and len(row["pngs"]) == 3,
                    "Recommended look requires Joyful and three native PNG keyframes.")
            key = f'{row["character"]}-{row["presetId"]}-joyful'
            gif_name = key + "-run-right.gif"
            self.gif(gif_name)  # Decode and verify recorded delays/loop; no derivative.
            links = [{"label": "Run right · actual GIF", "source": gif_name}]
            require({(png["action"], png["frameId"]) for png in row["pngs"]} == {("idle", 0), ("run", 55), ("jump", 86)},
                    "Recommended PNG keyframe coverage differs.")
            for png in row["pngs"]:
                name = Path(png["file"]).name
                self.png(name)  # Decode/hash check only; retain original PNG link.
                require(png["selection"] == row["selection"], "Recommended PNG garment selection differs.")
                links.append({"label": f'{png["action"].title()} frame {png["frameId"]} · native PNG', "source": name})
            self.supplement_link_groups.append({
                "label": f'{row["character"].title()} / {row["presetName"]} / Joyful',
                "captureKey": key, "presetId": row["presetId"], "presetName": row["presetName"],
                "selection": row["selection"], "hairId": row["hairId"], "faceId": row["faceId"],
                "items": row["items"], "links": links,
            })

    def html(self):
        def href(path):
            import os
            return html.escape(os.path.relpath(ROOT / path, self.output), quote=True)

        sections = []
        for output in self.outputs:
            name = Path(output["file"]).name
            source_links = " · ".join(f'<a href="{href(self.sources[source]["file"])}">{html.escape(source)}</a>'
                                      for source in output["sources"])
            sections.append(f'<section><h2>{html.escape(output.get("title", name))}</h2>'
                            f'<a href="{html.escape(name)}"><img src="{html.escape(name)}" alt="{html.escape(name)}" loading="lazy"></a>'
                            f'<details><summary>Unchanged app downloads</summary><p class="files">{source_links}</p></details></section>')
        def link_group_html(groups):
            result = []
            for group in groups:
                links = " · ".join(f'<a href="{href(self.sources[item["source"]]["file"])}">{html.escape(item["label"])}</a>'
                                   for item in group["links"])
                selection = "; ".join(f"{slot}: {item or 'none'}" for slot, item in group["selection"].items())
                result.append(f'<li><strong>{html.escape(group["label"])}</strong><br>{links}'
                              f'<br><small>Captured selection: {html.escape(selection)}</small></li>')
            return "".join(result)
        text = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kling expression and shirt review</title><style>
body{margin:0 auto;padding:24px;max-width:1200px;background:#f6f3ec;color:#24262b;font:16px/1.5 system-ui,sans-serif}
h1{font-size:30px;line-height:1.2}h2{font-size:20px}section{margin:28px 0;padding:16px;background:#fff;border:1px solid #ddd7c9;border-radius:8px}
img{max-width:100%;height:auto;display:block}.files{font-size:12px;overflow-wrap:anywhere}li{margin:14px 0}a{color:#24577f}
details{margin-top:12px}p{max-width:900px}</style>
<h1>Expression and midnight sailor review</h1>
<p>Offline review arrangements made from completed production UI downloads. PNG crops use a neutral matte; the comparison GIFs preserve the downloaded frame order and delays, with one additional palette quantization. These boards are presentation derivatives, not new application exports.</p>
<p>GIF panels are already half native size in the app download. Open a PNG board directly for its stated 1x or 2x pixel view. Original PNGs and GIFs retain the exact captured bytes and are linked below every board. Natural means the current selectable natural face.</p>
<p>The main capture selected the retained Everyday and Wedding presets. These are the exact older preset combinations recorded by the app, not a claim that they are the newest recommended wardrobe looks. The actual garment IDs for each exported look are listed below. The new-shirt animation uses the retained Everyday pants; its mixed-pants alternative is shown in the PNG contact sheet.</p>
'''
        if self.supplement_link_groups:
            text += '<section><h2>Current recommended looks · supplemental actual downloads</h2><p>A separate completed production capture records these four recommended preset combinations with Joyful and the shown hairstyle. Links open unchanged run-right GIFs and native PNG keyframes. This supplemental capture does not include saved projects, CharacterPacks, or standalone playback verification.</p><ul>' + link_group_html(self.supplement_link_groups) + '</ul>'
            text += f'<p><a href="{href(self.supplement_provenance["captureIndex"])}">Supplemental browser evidence</a></p></section>'
        text += "\n".join(sections)
        text += '<section><h2>Retained preset action downloads and all-action packs</h2><p>The main capture exports run in both directions, jump, and celebrate as GIFs. Idle and walk remain in each five-action CharacterPack; no unrecorded GIF is implied.</p><ul>' + link_group_html(self.link_groups) + '</ul></section>'
        text += f'<p><a href="review-index.json">Review provenance</a> · <a href="{href(relative(self.index_path))}">Browser capture evidence</a></p></html>\n'
        (self.output / "index.html").write_text(text)

    def run(self):
        for character in ["male", "female"]:
            panels = [("Current Natural", f"{character}-day-{HAIR[character]}-natural-run-right.gif"),
                      ("Gentle", f"{character}-day-{HAIR[character]}-gentle-run-right.gif"),
                      ("Joyful", f"{character}-day-joyful-run-right.gif")]
            self.comparison(f"{character}-expressions-run-right.gif",
                            f"{character.title()} / retained Everyday / {HAIR[character]} / run right", panels)
        self.faces(1)
        self.faces(2)
        self.comparison("midnight-sailor-run-both-directions.gif", "Midnight sailor / Joyful / retained Everyday pants / actual GIF downloads",
                        [("Run right", "male-midnight-sailor-joyful-run-right.gif"),
                         ("Run left", "male-midnight-sailor-joyful-run-left.gif")])
        self.shirt_contact()
        self.links()
        self.supplement_links()
        self.html()
        report = {"format": "gathria-expression-shirt-review", "version": 1,
                  "captureIndex": relative(self.index_path), "captureIndexSha256": sha(self.index_bytes),
                  "captureFinishedAt": self.capture["finishedAt"],
                  "rendererSha256": sha(Path(__file__).read_bytes()),
                  "actualUiDownload": False,
                  "scope": "Offline presentation of actual browser downloads. No new character artwork and no claim that comparison boards were exported by the application.",
                  "capturedLookSelections": {key: row["selection"] for key, row in self.packs.items()},
                  "presetNote": "Day and wedding capture keys refer to retained Everyday and Wedding presets, not the newest recommended wardrobe combinations. Exact captured garment IDs are recorded here and in the original capture packs.",
                  "sources": self.sources, "outputs": self.outputs, "originalDownloadLinks": self.link_groups,
                  "supplement": self.supplement_provenance, "recommendedLookDownloadLinks": self.supplement_link_groups,
                  "limitations": ["GIF presentation comparisons undergo a second palette quantization; original downloads are retained and linked.",
                                  "The review images alone do not establish playback or source provenance; consult independent artifact validation and capture evidence.",
                                  "Mixed pants are shown in four PNG keyframes; recorded shirt GIFs and CharacterPack use the pants from the retained Everyday preset.",
                                  "The browser capture has no idle/walk GIF downloads; those actions are present in the linked five-action packs."]}
        (self.output / "review-index.json").write_text(json.dumps(report, indent=2) + "\n")
        total = sum(path.stat().st_size for path in self.output.iterdir() if path.is_file())
        require(total <= MAX_BYTES, f"Review exceeds 20 MiB budget: {total} bytes")
        print(json.dumps({"review": relative(self.output / "index.html"), "outputs": len(self.outputs),
                          "sourceDownloads": len(self.sources), "bytes": total}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--supplement", type=Path,
                        default=DEFAULT_SUPPLEMENT if DEFAULT_SUPPLEMENT.is_file() else None,
                        help="Optional completed recommended-look evidence; default includes recommended-v1 when present.")
    args = parser.parse_args()
    Review(args.index.resolve(), args.output.resolve(), args.supplement.resolve() if args.supplement else None).run()


if __name__ == "__main__":
    main()
