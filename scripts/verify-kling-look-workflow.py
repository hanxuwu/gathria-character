#!/usr/bin/env python3
"""Decode actual exports, verify exact old art, and check both comparison panels."""
import io, os, json, zipfile, hashlib, math
from pathlib import Path
from functools import lru_cache
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get('KLING_LOOK_REVIEW_DIR', 'docs/kling-look-workflow/evidence')
sha = lambda b: hashlib.sha256(b).hexdigest()

class Pack:
    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        assert self.zip.testzip() is None
        self.m = json.loads(self.zip.read('manifest.json'))
        self.c = json.loads(self.zip.read('character.json'))
        self.frames = {f['id']: f for f in self.m['frames']}
        self.sheets = [self.m['spritesheet'], *self.m.get('additionalSheets', [])]
        self.page = None
        self.image = None
        for name in self.zip.namelist():
            assert not name.startswith('/') and '..' not in name.split('/')
            content = self.zip.read(name)
            assert content
            if name.endswith('.json'): json.loads(content)
            if name.endswith('.png'):
                with Image.open(io.BytesIO(content)) as im:
                    im.load()
                    assert im.mode == 'RGBA'
    def frame(self, fid):
        f = self.frames[fid]
        page = f.get('page', 0)
        if self.page != page:
            if self.image: self.image.close()
            self.image = Image.open(io.BytesIO(self.zip.read(self.sheets[page]['file']))).convert('RGBA')
            self.image.load()
            self.page = page
        return self.image.crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    def close(self):
        if self.image: self.image.close()
        self.zip.close()

def matte(image, rgb):
    canvas = Image.new('RGBA', image.size, (*rgb, 255))
    canvas.alpha_composite(image)
    return canvas.convert('RGB')

def check_png_panels(path, a, b, facing):
    with Image.open(path) as im:
        im.load()
        assert im.size == (a.width * 2 + 16, a.height + 48)
        errors = []
        for offset, image in [(0, a), (a.width + 16, b)]:
            if facing == 'left': image = ImageOps.mirror(image)
            expected = np.asarray(matte(image, (238, 234, 223))).astype(float)
            actual = np.asarray(im.convert('RGB').crop((offset, 48, offset + a.width, 48 + a.height))).astype(float)
            delta = np.abs(actual - expected)
            # Canvas's premultiplied-alpha round trip can differ by 1–2 levels.
            assert delta.max() <= 2 and delta.mean() < .25, (path.name, delta.max(), delta.mean())
            errors.append(float(delta.mean()))
        return max(errors)

def nested_zip(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert z.testzip() is None
        for name in z.namelist():
            content = z.read(name)
            if name.endswith('.png'):
                with Image.open(io.BytesIO(content)) as im: im.load()
            elif name.endswith('.json'): json.loads(content)
            elif name.endswith('.zip'): nested_zip(content)

def main():
    evidence_path = OUT / 'evidence-index.json'
    evidence = json.loads(evidence_path.read_text())
    assert evidence['passed'] and len(evidence['packs']) == 4 and len(evidence['playback']) == 40
    report = {'evidenceSha256': sha(evidence_path.read_bytes()), 'packs': [], 'pngs': [], 'gifs': [], 'projects': [], 'screenshots': []}
    packs = {}
    for record in evidence['packs']:
        path = ROOT / record['file']
        assert sha(path.read_bytes()) == record['sha256']
        pack = Pack(path)
        packs[record['file']] = pack
        with zipfile.ZipFile(ROOT / record['baseline']) as baseline:
            assert set(pack.zip.namelist()) == set(baseline.namelist())
            for name in pack.zip.namelist():
                assert pack.zip.read(name) == baseline.read(name), (path.name, name)
        for fid in pack.frames:
            im = pack.frame(fid)
            assert im.getchannel('A').getextrema() == (0, 255)
        report['packs'].append({'file': record['file'], 'frames': len(pack.frames), 'allFramesDecoded': True, 'allMetadataAndRgbaExactToMergedBaseline': True, 'baseline': record['baseline']})
    groups = {}
    for row in evidence['downloads']:
        path = ROOT / row['file']
        assert sha(path.read_bytes()) == row['sha256'] and path.stat().st_size == row['bytes']
        kind = row['kind']
        if kind == 'look-gif':
            a, b = packs[row['reference']], packs[row['current']]
            clip = b.m['animations'][row['action']]
            assert a.m['animations'] == b.m['animations'] and a.m['anchor'] == b.m['anchor']
            w, h = b.m['spritesheet']['frameWidth'] // 2, b.m['spritesheet']['frameHeight'] // 2
            errors = []
            with Image.open(path) as gif:
                assert gif.size == (w * 2 + 8, h + 16) and gif.n_frames == len(clip['frames'])
                assert (gif.info.get('loop') == 0) == clip['loop']
                times = [(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
                for i, fid in enumerate(clip['frames']):
                    gif.seek(i); gif.load(); assert gif.info['duration'] == times[i]
                    for offset, pack in [(0, a), (w + 8, b)]:
                        expected = matte(pack.frame(fid), (238, 233, 223)).resize((w,h), Image.Resampling.BOX)
                        if row['facing'] == 'left': expected = ImageOps.mirror(expected)
                        actual = gif.convert('RGB').crop((offset, 16, offset + w, h + 16))
                        error = float(np.abs(np.asarray(expected).astype(float) - np.asarray(actual).astype(float)).mean())
                        assert error < 4, (path.name, fid, error)
                        errors.append(error)
            groups.setdefault((row['character'], row['action']), {})[row['facing']] = path
            report['gifs'].append({'file': row['file'], 'frames': len(clip['frames']), 'durationsMs': times, 'loop': clip['loop'], 'bothPanelsMatchTheirExportedPacks': True, 'maxMeanQuantizationError': max(errors)})
        elif kind == 'look-png':
            a, b = packs[row['reference']].frame(row['frameId']), packs[row['current']].frame(row['frameId'])
            error = check_png_panels(path, a, b, row['facing'])
            report['pngs'].append({'file': row['file'], 'bothPanelsMatch': True, 'maxMeanAlphaRoundtripError': error})
        elif kind == 'frame':
            expected = packs[row['pack']].frame(row['frameId'])
            if row['facing'] == 'left': expected = ImageOps.mirror(expected)
            with Image.open(path) as im:
                im.load(); assert im.mode == 'RGBA' and im.tobytes() == expected.tobytes()
            report['pngs'].append({'file': row['file'], 'rgbaMatchesPackExactly': True})
        elif kind == 'padding-comparison':
            pack = packs[row['reference']]
            a = pack.frame(row['frameId'])
            with Image.open(ROOT / row['bare']) as bare:
                bare.load()
                padding = pack.c['sourceMetadata']['appearance']['padding']
                b = Image.new('RGBA', a.size)
                b.paste(bare, (padding['left'], padding['top']))
                assert bare.size == (a.width - padding['left'] - padding['right'], a.height - padding['top'] - padding['bottom'])
                error = check_png_panels(path, a, b, 'right')
            report['pngs'].append({'file': row['file'], 'unequalPaddingAlignedWithoutScaling': True, 'maxMeanAlphaRoundtripError': error})
        elif kind == 'project':
            raw = path.read_bytes(); nested_zip(raw)
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                doc = json.loads(z.read('document.json'))
                assert sha(z.read('source.character.zip')) == doc['sourceSha256']
                assert sha(z.read('registration.json')) == doc['registrationSha256']
                for i, item in enumerate(doc['items']): assert sha(z.read(f'item-{i}.zip')) == item['sha256']
                if doc.get('appearance'): assert sha(z.read('appearance.zip')) == doc['appearance']['bankSha256']
            report['projects'].append({'file': row['file'], 'allNestedPngZipJsonDecoded': True, 'assetHashesExact': True})
        elif kind in ['padding-current', 'mixed-frame']:
            with Image.open(path) as im:
                im.load(); assert im.mode == 'RGBA' and im.getchannel('A').getextrema() == (0, 255)
            report['pngs'].append({'file': row['file'], 'rgbaAndTransparencyDecoded': True})
    for key, sides in groups.items():
        if 'left' not in sides: continue
        with Image.open(sides['left']) as left, Image.open(sides['right']) as right:
            w = (left.width - 8) // 2
            for i in range(left.n_frames):
                left.seek(i); right.seek(i)
                a, b = np.asarray(left.convert('RGB')), np.asarray(right.convert('RGB'))
                assert np.array_equal(a[:16], b[:16]), (key, i, 'labels must not mirror')
                for offset in [0, w + 8]: assert np.array_equal(a[16:,offset:offset+w][:,::-1], b[16:,offset:offset+w]), (key,i,'panel mirror')
    for path in OUT.glob('*.png'):
        with Image.open(path) as im: im.load(); assert min(im.size) > 0
        if path.name.endswith(('-desktop.png', '-mobile.png', '-independent.png')): report['screenshots'].append(str(path.relative_to(ROOT)))
    for p in packs.values(): p.close()
    report['passed'] = True
    (OUT.parent / 'export-checks.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: len(value) for key,value in report.items() if isinstance(value,list)}))

if __name__ == '__main__': main()
