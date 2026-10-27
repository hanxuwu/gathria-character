#!/usr/bin/env python3
"""Independent decoding audit of actual Strong pixels browser exports.

Reads the exact temporary smooth CharacterPacks and retained candidate packs.
Recomputes grid/anchor mapping and binary alpha from source pixels with NumPy;
also compares every source RGBA frame against the retained PR48 input; never
imports the application's conversion code. Palette color aesthetics and
perceived animation quality require visual review in addition to these checks.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ["idle", "walk", "run", "jump", "celebrate"]
MATTE = np.array([238, 233, 223], dtype=np.uint8)
sha = lambda b: hashlib.sha256(b).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def path_for(row):
    return Path(row['file']) if row.get('temporary') else ROOT / row['file']


class Pack:
    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        require(self.zip.testzip() is None, f'Bad ZIP CRC: {path}')
        names = self.zip.namelist()
        require(len(names) == len(set(names)), f'Duplicate archive members: {path}')
        require(all('/' not in name and '\\' not in name for name in names), 'Unsafe archive paths')
        self.manifest = json.loads(self.zip.read('manifest.json'))
        self.config = json.loads(self.zip.read('character.json'))
        self.sheets = [self.manifest['spritesheet']] + self.manifest.get('additionalSheets', [])
        require(set(names) == {'manifest.json', 'character.json', 'PROVENANCE.txt', 'INTEGRATION.md', *[s['file'] for s in self.sheets]}, 'Unexpected pack envelope')
        self.frames = {f['id']: f for f in self.manifest['frames']}
        require(len(self.frames) == len(self.manifest['frames']), 'Duplicate frame IDs')
        self.cached_page = None
        self.cached_pixels = None
        for s in self.sheets:
            with Image.open(io.BytesIO(self.zip.read(s['file']))) as image:
                image.load()
                require(image.mode == 'RGBA' and image.size == (s['width'], s['height']), 'Atlas metadata differs from PNG')

    def frame(self, fid):
        f = self.frames[fid]
        page = f.get('page', 0)
        if self.cached_page != page:
            self.cached_pixels = None
            with Image.open(io.BytesIO(self.zip.read(self.sheets[page]['file']))) as image:
                image.load()
                self.cached_pixels = np.array(image)
            self.cached_page = page
        x, y, w, h = (f[k] for k in ['x', 'y', 'width', 'height'])
        result = self.cached_pixels[y:y+h, x:x+w]
        require(result.shape == (h, w, 4), 'Frame escaped atlas')
        return result

    def close(self):
        self.cached_pixels = None
        self.zip.close()


def expected_alpha(source, mapping, sampling):
    p, factor = mapping['padding'], mapping['factor']
    alpha = np.pad(source[:, :, 3], ((p['top'], p['bottom']), (p['left'], p['right'])))
    require(alpha.shape == (mapping['height']*factor, mapping['width']*factor), 'Invalid padded frame')
    if sampling == 'nearest':
        return (alpha[factor//2::factor, factor//2::factor] >= 128).astype(np.uint8) * 255
    cells = alpha.reshape(mapping['height'], factor, mapping['width'], factor)
    sums = cells.sum(axis=(1,3), dtype=np.uint32)
    eligible = cells.max(axis=(1,3)) >= 64
    return ((sums / (factor*factor*255) >= .42) & eligible).astype(np.uint8) * 255


def pack_checks(build, evidence, result):
    source, target = Pack(path_for(build['sourcePack'])), Pack(path_for(build['pixelPack']))
    recipe = json.loads(path_for(build['buildReport']).read_bytes())
    sm, tm, sc, tc = source.manifest, target.manifest, source.config, target.config
    require(build['source'] == {'manifest':sm,'config':sc} and build['target'] == {'manifest':tm,'config':tc}, 'Captured metadata differs from ZIP')
    require(recipe['format'] == 'gathria-pixel-refinement-report' and recipe['version'] == 1, 'Unknown candidate recipe')
    require(recipe['sourceSha256'] == build['sourcePack']['sha256'] and recipe['outputSha256'] == build['pixelPack']['sha256'], 'Input/output binding differs')
    require(recipe['settings'] == build['settings'] == evidence['plan']['settings'], 'Settings differ')
    require(recipe['algorithmVersion'] == 'gathria-kling-pixel-refinement-v2', 'Unknown algorithm revision')
    require(recipe['settings'].get('finish') == 'cluster', 'Strong finish not enabled')
    require(tm['generator'] == recipe['algorithmVersion'], 'Generator disagrees with strong recipe')
    cleanup = recipe.get('cleanup')
    require(cleanup and cleanup['algorithmVersion'] == 'supported-shade-islands-v1' and cleanup['passes'] == 1, 'Unknown cluster cleanup')
    require(isinstance(cleanup['changedPixels'], int) and cleanup['changedPixels'] >= 0, 'Invalid cleanup count')
    require(sm['schemaVersion'] in [2,3] and tm['schemaVersion'] == 4, 'Candidate contract was not opt-in V4')
    require(tm['scale']['pixelArt'] and tm['scale']['integerOnly'], 'Pixel sampling declaration missing')
    require(sm['animations'] == tm['animations'], 'Original action frames/FPS/holds/loop flags changed')
    require(set(tm['animations']) == set(ACTIONS), 'Not all five source actions included')
    require(sc['derivation']['frames'] == tc['derivation']['frames'], 'Source pose/time mapping changed')
    require(list(source.frames) == list(target.frames), 'Source frame IDs/order changed')
    require(recipe['sourceFrameCount'] == len(source.frames), 'Frame count differs')
    for key, value in sc.get('sourceMetadata', {}).items():
        require(tc['sourceMetadata'][key] == value, f'Source metadata changed: {key}')
    require(tc['source']['sha256'] == build['sourcePack']['sha256'] and tc['source']['kind'] == 'unified-archive', 'Candidate provenance misidentifies source')
    metadata = tc['sourceMetadata']['pixelRefinement']
    require(metadata['algorithmVersion'] == recipe['algorithmVersion'] and metadata['cleanup'] == cleanup, 'Embedded cleanup recipe differs')
    require(metadata['sourcePackSha256'] == build['sourcePack']['sha256'] and metadata['sourceReference'] == sc['source'], 'Source reference mismatch')
    mapping = recipe['mapping']
    factor, padding = mapping['factor'], mapping['padding']
    require(factor == recipe['settings']['factor'], 'Different sampling factor')
    require(mapping['sourceWidth'] == sm['spritesheet']['frameWidth'] and mapping['sourceHeight'] == sm['spritesheet']['frameHeight'], 'Source dimensions changed')
    require(mapping['sourceAnchor'] == {k:sm['anchor'][k] for k in ['x','y']}, 'Wrong source anchor')
    require(all(isinstance(v, int) and 0 <= v < factor for v in padding.values()), 'Padding is not minimal grid-only padding')
    for axis, before, after, size in [('x','left','right','Width'), ('y','top','bottom','Height')]:
        target_size = mapping['width' if axis == 'x' else 'height']
        require((mapping['source'+size]+padding[before]+padding[after]) == target_size*factor, 'Nonuniform canvas scaling')
        require(sm['anchor'][axis]+padding[before] == mapping['anchor'][axis]*factor == tm['anchor'][axis]*factor, 'Anchor is not exactly preserved')
    require((mapping['width'], mapping['height']) == (tm['spritesheet']['frameWidth'], tm['spritesheet']['frameHeight']), 'Target dimensions differ from mapping')
    palette = recipe['palette']
    palette_json = json.dumps(palette, separators=(',', ':')).encode()
    require(sha(palette_json) == recipe['paletteSha256'] == metadata['paletteSha256'], 'Palette hash differs')
    require(palette == metadata['palette'] and mapping == metadata['mapping'], 'Embedded recipe differs from report')
    require(0 < len(palette) <= recipe['settings']['colors'], 'Palette count exceeded')
    require(all(len(c) == 3 and all(isinstance(x, int) and 0 <= x <= 255 for x in c) for c in palette), 'Malformed palette')
    palette_keys = np.array([(r << 16) | (g << 8) | b for r,g,b in palette], np.uint32)
    require(len(set(palette_keys)) == len(palette_keys), 'Duplicate palette colors')
    require(list(palette_keys) == sorted(palette_keys), 'Palette ordering not canonical')
    for page in recipe['pages']:
        require(sha(target.zip.read(page['file'])) == page['sha256'], 'PNG page hash mismatch')
    prior_path = path_for(build['priorSource'])
    require(prior_path.exists() and sha(prior_path.read_bytes()) == build['priorSource']['sha256'], 'Retained original source changed or missing')
    prior = Pack(prior_path)
    require(prior.manifest == sm and prior.config == sc, 'New smooth source metadata differs from retained same-look original')
    require(list(prior.frames) == list(source.frames), 'New source uses other pose IDs')
    count, opaque, frame_hashes = 0, 0, []
    for fid in target.frames:
        pixels, original = target.frame(fid), source.frame(fid)
        require(np.array_equal(original, prior.frame(fid)), f'Approved source art changed at pose {fid}')
        require(pixels.shape == (mapping['height'], mapping['width'], 4), 'Frame dimensions differ')
        alpha = pixels[:, :, 3]
        require(np.isin(alpha, [0,255]).all() and np.any(alpha), 'Candidate alpha is not nonempty binary alpha')
        require(np.all(pixels[alpha == 0] == 0), 'Transparent RGB contamination')
        predicted = expected_alpha(original, mapping, recipe['settings']['sampling'])
        require(np.array_equal(alpha, predicted), f'Fixed-grid alpha differs at pose {fid}')
        rgb = pixels[:, :, :3].astype(np.uint32)
        colors = (rgb[:, :, 0] << 16) | (rgb[:, :, 1] << 8) | rgb[:, :, 2]
        require(np.isin(colors[alpha > 0], palette_keys).all(), f'Unshared colors at pose {fid}')
        count += 1
        opaque += int((alpha > 0).sum())
        frame_hashes.append({'frameId': fid, 'rgbaSha256': sha(pixels.tobytes())})
    prior.close()
    result['packs'].append({'case':build['case'], 'originalSourceRgbaExact':True, 'priorSourceSha256':build['priorSource']['sha256'], 'cleanup':cleanup, 'framesDecoded':count, 'paletteColors':len(palette), 'opaquePixels':opaque, 'sourceAlphaGridExact':True, 'anchorMappingExact':True, 'sourceActionsAndDerivationExact':True, 'sourceMetadataRetained':True, 'frames':frame_hashes})
    return source, target


def gif_projection(frame, palette):
    """Independent equivalent of the documented GIF RGB565-cache projection.

    Palette is read from the exported GIF. First RGB in each RGB565 bucket wins;
    equal-distance colors choose the final palette entry. Facing mirror happens
    after this mapping, matching the original-coordinate palette cache.
    """
    rgb = np.where(frame[:, :, 3:4] == 0, MATTE, frame[:, :, :3]).astype(np.uint8)
    flat = rgb.reshape(-1,3).astype(np.int32)
    keys = ((flat[:,0] >> 3) << 11) | ((flat[:,1] >> 2) << 5) | (flat[:,2] >> 3)
    unique, first, inverse = np.unique(keys, return_index=True, return_inverse=True)
    representatives = flat[first]
    distance = ((representatives[:,None,:] - palette[None,:,:].astype(np.int32)) ** 2).sum(axis=2)
    closest = len(palette)-1-np.argmin(distance[:,::-1],axis=1)
    projected = palette[closest[inverse]].reshape(rgb.shape)
    return projected, float(np.abs(projected.astype(float)-rgb.astype(float)).mean())


def gif_check(row, target):
    clip = target.manifest['animations'][row['action']]
    delays, errors = [], []
    with Image.open(path_for(row)) as image:
        require(image.n_frames == len(clip['frames']), 'GIF frame count differs from action')
        require((image.info.get('loop') == 0) == clip['loop'], 'GIF one-shot/loop flag differs')
        palette = np.array(image.getpalette(), np.uint8).reshape(-1,3)
        for i, fid in enumerate(clip['frames']):
            image.seek(i);image.load()
            delay = (math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10
            require(image.info.get('duration') == delay, f'GIF delay differs at {i}')
            actual = np.array(image.convert('RGB'))
            expected, error = gif_projection(target.frame(fid), palette)
            if row['facing'] == 'left':
                expected = expected[:,::-1]
            require(np.array_equal(actual, expected), f'GIF pixels/frame order differ from exact palette projection: {row["file"]} position {i}')
            delays.append(delay);errors.append(error)
    return {'file':row['file'], 'frames':len(delays), 'durationsMs':delays, 'totalDurationMs':sum(delays), 'loop':clip['loop'], 'paletteProjectionExact':True, 'maxMeanPaletteError':max(errors)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--index', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    index = (ROOT / args.index).resolve()
    output = (ROOT / args.output).resolve() if args.output else index.parent / 'artifact-validation.json'
    require(not output.exists(), f'Preserve previous audit {output}')
    raw = index.read_bytes()
    e = json.loads(raw)
    result = {'format':'gathria-strong-pixel-artifact-audit','version':1,'passed':False,'capture':{'file':str(index.relative_to(ROOT)), 'sha256':sha(raw)},'verifierSha256':sha(Path(__file__).read_bytes()),'artifacts':[],'packs':[],'pngs':[],'gifs':[],'mirrorPairs':[],'playbackCases':len(e['playback'])}
    opened = {}
    try:
        require(e['format'] == 'gathria-strong-pixel-browser-evidence' and e['passed'] and e['production'], 'Production capture incomplete')
        require(e.get('editorsClosedBeforePlayer'), 'Player evidence not independent')
        baseline_data = (ROOT/e['baseline']['file']).read_bytes()
        require(sha(baseline_data) == e['baseline']['sha256'], 'Retained baseline evidence changed')
        baseline = json.loads(baseline_data)
        require(baseline['passed'] and baseline['production'], 'Retained baseline is not completed production evidence')
        for build in e['builds']:
            prior = next(b for b in baseline['builds'] if b['case'] == build['case'])
            require(build['priorSource'] == prior['sourcePack'] and build['priorPixel'] == prior['pixelPack'], 'Wrong same-look baseline binding')
        for key in ['browserErrors','consoleErrors','failedRequests','externalRequests','independentEditorRequests']:
            require(not e[key], f'Browser failure: {key}')
        require(sha((ROOT/'scripts/capture-kling-strong-pixels.mjs').read_bytes()) == e['scriptSha256'], 'Capture helper changed')
        for path, digest in e['compiledJsSha256'].items():
            require(sha((ROOT/path).read_bytes()) == digest, f'Production build changed: {path}')
        for name, digest in e['htmlSha256'].items():
            require(sha((ROOT/'dist'/name).read_bytes()) == digest, 'Production HTML changed')
        require(sha((ROOT/'docs/kling-wardrobe/catalog.json').read_bytes()) == e['catalogSha256'], 'Catalog changed')
        records = e['downloads'] + e['screenshots']
        require(len({r['file'] for r in records}) == len(records), 'Duplicate artifact path')
        for row in records:
            path = path_for(row);require(path.is_file(), f'Missing captured file {path}')
            raw_file = path.read_bytes()
            require(len(raw_file) == row['bytes'] > 0 and sha(raw_file) == row['sha256'], f'Artifact changed: {path}')
            item = {k:row[k] for k in ['file','kind','bytes','sha256']}
            if path.suffix == '.json':
                json.loads(raw_file);item['jsonDecoded'] = True
            elif path.suffix in ['.png','.gif']:
                with Image.open(io.BytesIO(raw_file)) as image:
                    for position in range(getattr(image,'n_frames',1)):
                        image.seek(position);image.load()
                    item.update({'width':image.width,'height':image.height,'frames':getattr(image,'n_frames',1)})
                    require(image.width > 0 and image.height > 0, 'Empty image')
            elif path.suffix == '.zip':
                with zipfile.ZipFile(io.BytesIO(raw_file)) as archive:
                    require(archive.testzip() is None, 'Bad ZIP CRC')
                    item['members'] = archive.namelist()
            else:
                raise AssertionError(f'Unexpected artifact suffix: {path}')
            result['artifacts'].append(item)
        del raw_file
        for build in e['builds']:
            opened[build['case']] = pack_checks(build,e,result)
        for row in e['downloads']:
            if row['kind'] in ['source-png','pixel-png']:
                pack = opened[row['case']][row['kind'] == 'pixel-png']
                expected = pack.frame(row['frameId'])
                if row['facing'] == 'left':expected = expected[:,::-1]
                with Image.open(path_for(row)) as image:
                    image.load()
                    require(image.mode == 'RGBA' and np.array_equal(np.array(image),expected), 'Native export differs from atlas')
                result['pngs'].append({'file':row['file'],'frameId':row['frameId'],'nativeRgbaExact':True})
            elif row['kind'] == 'pixel-gif':
                result['gifs'].append(gif_check(row,opened[row['case']][1]))
        for build in e['builds']:
            rows = [r for r in e['downloads'] if r.get('case') == build['case'] and r['kind'] == 'pixel-gif' and r['action'] == 'run']
            left = next(r for r in rows if r['facing'] == 'left')
            right = next(r for r in rows if r['facing'] == 'right')
            with Image.open(path_for(left)) as l, Image.open(path_for(right)) as r:
                require(l.n_frames == r.n_frames and l.size == r.size, 'Mirror dimensions/frame count differ')
                for i in range(l.n_frames):
                    l.seek(i);r.seek(i)
                    require(np.array_equal(np.array(l.convert('RGB'))[:,::-1],np.array(r.convert('RGB'))), 'Left GIF is not exact right mirror')
            result['mirrorPairs'].append({'case':build['case'],'action':'run','exact':True})
        require(len(e['builds']) == len(e['plan']['cases']), 'Missing requested looks')
        require(len(e['playback']) == len(e['builds'])*10, 'Missing independent playback cases')
        require(len({(r['case'],r['action'],r['facing']) for r in e['playback']}) == len(e['playback']), 'Duplicate playback cases')
        for row in e['playback']:
            target = opened[row['case']][1]
            for scrub in row['scrubs']:
                require(target.manifest['animations'][row['action']]['frames'][scrub['position']] == scrub['frameId'], 'Independent scrub ID mismatch')
            for observed in row['observed']:
                require(target.manifest['animations'][observed['action']]['frames'][observed['position']] == observed['frameId'], 'Independent playback ID mismatch')
            require(row['zoom'] == 1 and row['playbackSpeed'] == 1, 'Independent playback altered source speed')
        result['passed'] = True
    except Exception as error:
        result['failure'] = str(error)
        raise
    finally:
        for packs in opened.values():
            for pack in packs:pack.close()
        output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'passed':result['passed'],'output':str(output.relative_to(ROOT)),'artifacts':len(result['artifacts']),'nativePackFrames':sum(p['framesDecoded'] for p in result['packs']),'pngs':len(result['pngs']),'gifs':len(result['gifs']),'mirrorPairs':len(result['mirrorPairs']),'independentPlayerCases':result['playbackCases']},indent=2))


if __name__ == '__main__':
    main()
