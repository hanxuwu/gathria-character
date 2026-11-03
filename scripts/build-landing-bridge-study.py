#!/usr/bin/env python3
"""Build an isolated, baked bridge-art study without changing production routes.

Only combines supplied PNGs into a new page. Never synthesizes artwork or edits
existing atlas pixels. The independent player uses an ordinary one-shot Jump
list; it does not invoke immutable gameplay profiles.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile
from PIL import Image

MAX_ARCHIVE = 64 * 1024 * 1024
NAME = 'Kling male · generated landing bridge study (review only)'
NEW_IDS = [107, 108]

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()

def archive(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        for name, data in files.items():
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name.endswith(('.png', '.zip')) else zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()

def load_png(path: Path) -> tuple[bytes, Image.Image]:
    data = path.read_bytes()
    image = Image.open(io.BytesIO(data))
    assert image.format == 'PNG' and image.mode == 'RGBA', f'{path}: supply RGBA PNG'
    assert image.size == (512, 768), f'{path}: expected fixed 512×768 canvas, got {image.size}'
    image.load()
    alpha = image.getchannel('A')
    lo, hi = alpha.getextrema()
    assert lo == 0 and hi > 0, f'{path}: empty or no transparent background'
    return data, image

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-pack', required=True, type=Path)
    parser.add_argument('--bridge-107', required=True, type=Path)
    parser.add_argument('--bridge-108', required=True, type=Path)
    parser.add_argument('--provenance', required=True, type=Path,
                        help='JSON generation/paint provenance and any exact-source head protection records')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--fixture-only', action='store_true',
                        help='Mark schema-test inputs as fixtures, never generated or accepted art')
    args = parser.parse_args()
    base_bytes = args.base_pack.read_bytes()
    with zipfile.ZipFile(io.BytesIO(base_bytes)) as z:
        files = {name: z.read(name) for name in z.namelist()}
    base_manifest = json.loads(files['manifest.json'])
    base_recipe = json.loads(files['character.json'])
    profile = base_recipe.get('sourceMetadata', {}).get('gameplayMotion')
    assert profile and profile['id'] == 'kling-male-side-single-jump-v7', 'Use the actual current male V7 pack'
    assert base_manifest['schemaVersion'] == 3 and len(base_manifest['additionalSheets']) == 1
    assert sorted(f['id'] for f in base_manifest['frames']) == list(range(107))
    assert base_manifest['spritesheet']['frameWidth'] == 512
    assert base_manifest['spritesheet']['frameHeight'] == 768
    assert base_manifest['anchor'] == {'x': 256, 'y': 710, 'units': 'pixels', 'origin': 'top-left'}
    assert profile['actions']['run']['frames'] == list(range(39, 57))
    assert profile['actions']['jump']['frames'] == list(range(63, 91))
    assert profile['actions']['run']['fps'] == profile['actions']['jump']['fps'] == 24
    landing = next(r for r in profile['routes'] if r['from'] == 'jump' and r['to'] == 'run' and r['exit'] == 23)
    assert landing == {'from': 'jump', 'to': 'run', 'exit': 23, 'entry': 9, 'leadIn': [88, 89]}
    inputs = [load_png(args.bridge_107), load_png(args.bridge_108)]
    art_provenance = json.loads(args.provenance.read_bytes())
    assert isinstance(art_provenance, dict), 'Art provenance must be an object'
    assert len(json_bytes(art_provenance)) <= 32 * 1024, 'Art provenance JSON exceeds bounded embedded budget'
    if not args.fixture_only:
        assert art_provenance.get('origin') in ('generated-art-candidate', 'generated-and-painted-art-candidate'), 'Declare generated art candidacy explicitly'
        assert art_provenance.get('visualAcceptance') == 'pending', 'This builder never declares visual acceptance'
        assert art_provenance.get('frames') and all(str(fid) in art_provenance['frames'] for fid in NEW_IDS), 'Each new frame requires provenance'
    status = 'schema-fixture-only' if args.fixture_only else 'generated-review-candidate'
    name = 'Kling male · bridge schema fixture (not artwork)' if args.fixture_only else NAME
    origin_kind = 'existing-source-fixture' if args.fixture_only else 'new-generated-art-candidate'

    # Package all original source inputs as an external reference archive. Its
    # actual hash replaces the old video's summary SHA; never claim new poses
    # came from that video. Original per-frame video maps remain in base pack.
    index = [
        {'index': f['id'], 'kind': 'unchanged-existing-baked-frame', 'archive': 'base.character.zip',
         'frameId': f['id'], 'originalDerivation': next(d for d in base_recipe['derivation']['frames'] if d['frameId'] == f['id'])}
        for f in base_manifest['frames']
    ]
    index += [
        {'index': fid, 'kind': origin_kind, 'file': f'bridge-{fid}.png', 'sha256': sha(data), 'notAnOriginalVideoFrame': True}
        for fid, (data, image) in zip(NEW_IDS, inputs)
    ]
    source_name = 'male-landing-bridge-source.zip'
    source_bytes = archive({
        'base.character.zip': base_bytes,
        'bridge-107.png': inputs[0][0], 'bridge-108.png': inputs[1][0],
        'source-index.json': json_bytes({'format': 'gathria-bridge-source-index', 'version': 1,
            'status': status, 'indexMeaning': 'Archive collection entries, not video frame numbers; timeSeconds=0 means no single source timeline.', 'entries': index}),
        'art-provenance.json': json_bytes(art_provenance),
    })
    sheet = Image.new('RGBA', (1024, 768))
    for col, (data, image) in enumerate(inputs):
        sheet.paste(image, (col * 512, 0))
    stream = io.BytesIO(); sheet.save(stream, format='PNG')
    new_png = stream.getvalue()
    manifest = json.loads(json.dumps(base_manifest))
    manifest['name'] = name
    manifest['generator'] = 'gathria isolated landing bridge art study v1'
    manifest['additionalSheets'].append({'file': 'spritesheet-2.png', 'width': 1024, 'height': 768,
        'frameWidth': 512, 'frameHeight': 768, 'columns': 2, 'rows': 1})
    for col, fid in enumerate(NEW_IDS):
        manifest['frames'].append({'id': fid, 'page': 2, 'x': col * 512, 'y': 0, 'width': 512, 'height': 768})
    run = profile['actions']['run']['frames']
    resumed = run[9:] + run[:9]
    before_bridge = run + run[:4] + [60, 61, 62] + list(range(63, 86)) + [88, 89]
    base_sequence = before_bridge + resumed
    sequence = before_bridge + NEW_IDS + resumed
    assert len(base_sequence) == 68 and len(sequence) == 70
    manifest['animations']['jump'] = {'frames': sequence, 'fps': 24, 'loop': False}
    # There is deliberately no gameplayMotion, motionFlow, or production route.
    recipe = {
        'format': 'gathria-baked-character', 'schemaVersion': 1, 'name': name,
        'characterId': 'male-side-landing-bridge-art-study-v1',
        'source': {'kind': 'unified-archive', 'name': source_name, 'sha256': sha(source_bytes)},
        'provenance': ('SCHEMA FIXTURE ONLY. No new art was created; do not visually review these placeholder frames. ' if args.fixture_only else
            'EXPERIMENTAL GENERATED ART CANDIDATE, not accepted original artwork. New atlas frames107/108 are generated/painted bridge proposals, not video extractions. ')
            + 'The 107 existing baked frames and their original two PNG pages are retained byte for byte. The appended frames are for this fixed complete look only. No reusable wardrobe or skeleton compatibility is claimed.',
        'derivation': {
            'method': 'Retain the original atlas pages and append two supplied transparent512×768 PNGs on page2. The Jump action is a linear Run→Jump→new bridge→Run review sequence with two additional native-duration ticks. Source indices refer to source-index.json archive collection entries, NOT video frame numbers. timeSeconds=0 denotes no single source timeline; original video/frame/time mappings remain in base.character.zip. No default gameplay allowlist is changed.',
            'frames': [{'frameId': e['index'], 'sourceFrame': e['index'], 'timeSeconds': 0} for e in index],
        },
        'sourceMetadata': {'landingBridgeStudy': {
            'format': 'gathria-landing-bridge-art-study', 'version': 1, 'status': status,
            'visualAcceptance': 'not-applicable-fixture' if args.fixture_only else 'pending',
            'basePackSha256': sha(base_bytes), 'baseProfileId': profile['id'],
            'baseManifestSha256': sha(files['manifest.json']),
            'existingFrameIds': list(range(107)), 'candidateFrameIds': NEW_IDS,
            'sourceIndexMeaning': 'Archive collection entry; never interpret generated IDs as video frames',
            'sourceIndexFile': 'source-index.json in the separate source archive',
            'artProvenance': art_provenance,
            'actionMeaning': {'jump': 'One-shot whole run/jump/new-bridge/run review; not the original basic Jump'},
            'baselineSequence': base_sequence, 'candidateSequence': sequence,
            'fps': 24, 'baselineTicks': 68, 'candidateTicks': 70, 'addedTicks': 2,
            'newArtworkIsOriginalVideoExtraction': False,
            'originalAtlasSha256': {file: sha(files[file]) for file in ('spritesheet.png', 'spritesheet-1.png')},
            'newPageSha256': sha(new_png),
        }},
    }
    assert len(json_bytes(recipe['sourceMetadata'])) <= 64 * 1024
    doc = f'''EXPERIMENTAL LANDING BRIDGE STUDY — {status}\n\n{recipe['provenance']}\n\n{recipe['derivation']['method']}\n\nSource archive: {source_name}\nSHA256: {sha(source_bytes)}\nBase pack SHA256: {sha(base_bytes)}\n\nTwo authored candidate ticks add83.333ms at24FPS: 68→70 ticks. This is not an equal-duration replacement and no naturalness acceptance is implied.\n'''
    integration = '''# Isolated generated bridge study\n\nLoad this ZIP in the existing player and choose Jump. Jump is explicitly a whole Run→Jump→candidate bridge→Run review sequence, plays once and holds its final frame. It is not the ordinary basic Jump action. Idle/Walk/Run retain their supplied source lists.\n\nNo gameplayMotion or motionFlow is declared; ordinary list playback is intentional. This does not enable interactive Run/Jump transitions, change any production default, or expand the immutable route allowlist.\n\nFrames107/108 are newly authored candidates (or explicitly labelled schema fixtures), not original video frames. sourceFrame values are archive entry indices; timeSeconds=0 is not a fabricated video timestamp. The original source maps are inside base.character.zip in the separate source archive.\n\nUse all three declared RGBA atlas pages, each frame's page and rectangle, the unchanged anchor(256,710), native facing right, and mirror-x for left. Frame dimensions remain512×768. Render at24FPS without pose blending or normalization.\n\nThis pack has fixed baked clothing and hair, not editable wardrobe layers. Inspect head/ear/neck joins, body volume, sole contact and frame-to-frame consistency before accepting the added artwork. No runtime generation is used.\n'''
    package = archive({
        'spritesheet.png': files['spritesheet.png'], 'spritesheet-1.png': files['spritesheet-1.png'], 'spritesheet-2.png': new_png,
        'manifest.json': json_bytes(manifest), 'character.json': json_bytes(recipe),
        'PROVENANCE.txt': doc.encode(), 'INTEGRATION.md': integration.encode(),
    })
    assert len(package) <= MAX_ARCHIVE
    with zipfile.ZipFile(io.BytesIO(package)) as check:
        assert check.read('spritesheet.png') == files['spritesheet.png']
        assert check.read('spritesheet-1.png') == files['spritesheet-1.png']
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / source_name).write_bytes(source_bytes)
    (args.out / 'male-landing-bridge-study.character.zip').write_bytes(package)
    (args.out / 'manifest.json').write_bytes(json_bytes(manifest))
    (args.out / 'character.json').write_bytes(json_bytes(recipe))
    receipt = {'status': status, 'fixtureOnly': args.fixture_only, 'artAccepted': False, 'basePackSha256': sha(base_bytes), 'packSha256': sha(package),
        'sourceArchiveSha256': sha(source_bytes), 'packBytes': len(package), 'existingAtlasBytesUnchanged': True,
        'oldFrameCount': 107, 'newFrameIds': NEW_IDS, 'sourceFPS': 24, 'baselineTicks': 68, 'candidateTicks': 70,
        'addedMilliseconds': 2000 / 24, 'gameplayProfileDeclared': False}
    (args.out / 'build-receipt.json').write_bytes(json_bytes(receipt))
    print(json.dumps(receipt))

if __name__ == '__main__':
    main()
