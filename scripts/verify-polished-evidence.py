"""Decode every delivered image/archive, check timelines and provenance hashes."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import subprocess
import zipfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'docs/art-polished'
sha = lambda data: hashlib.sha256(data).hexdigest()
index = json.loads((D / 'evidence-index.json').read_text())
assert index['artworkVersion'] == 6
assert len(index['exports']) == 20
assert len(index['playback']) == 24
assert not any(index[key] for key in ('errors', 'external', 'forbidden'))
for key, file in (
    ('sourceSha256', 'artwork/cohesive-source/character-expression-bank.png'),
    ('garmentSourceSha256', 'artwork/cohesive-source/garment-backplate.png'),
    ('preparedBankSha256', 'src/core/polished-assets.generated.ts'),
):
    assert index[key] == sha((ROOT / file).read_bytes()), file
for file, expected in index['revisionFiles'].items():
    assert expected == sha((ROOT / file).read_bytes()), file
for file, expected in json.loads((ROOT / 'artwork/polished-source-baseline.json').read_text()).items():
    assert expected == sha((ROOT / file).read_bytes()), file

records = []
for path in sorted(D.rglob('*.png')):
    assert path.stat().st_size > 0, path
    with Image.open(path) as im:
        assert im.format == 'PNG'
        im.load()
        records.append(dict(file=str(path.relative_to(D)), bytes=path.stat().st_size, sha256=sha(path.read_bytes()), size=im.size))

archives = []
for item in index['exports']:
    name, config = item['id'], item['config']
    path = D / (name + '.character.zip')
    assert path.stat().st_size > 0
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None, name
        assert set(z.namelist()) == {'spritesheet.png', 'manifest.json', 'character.json', 'INTEGRATION.md', 'PROVENANCE.txt'}
        for member in z.namelist():
            assert z.read(member) == (D / name / member).read_bytes(), (name, member)
            assert len(z.read(member)) > 0
        assert json.loads(z.read('character.json')) == config
        version = 5 if name.startswith('before-') else 6
        assert config['artworkVersion'] == version
        m = json.loads(z.read('manifest.json'))
        assert m['schemaVersion'] == 1
        assert m['anchor']['x'] == 96 and m['anchor']['y'] == 240
        assert m['facing'] == {'native': 'right', 'right': 'none', 'left': 'mirror-x'}
        assert len(m['frames']) == 12 and [f['id'] for f in m['frames']] == list(range(12))
        with Image.open(BytesIO(z.read('spritesheet.png'))) as image:
            image.load()
            assert image.size == (1536, 512)
            rgba = np.array(image.convert('RGBA'))
        assert set(np.unique(rgba[:, :, 3])) == {0, 255}
        for f in m['frames']:
            assert f['width'] == 192 and f['height'] == 256
            assert 0 <= f['x'] <= 1536-192 and 0 <= f['y'] <= 512-256
            a = rgba[f['y']:f['y']+256, f['x']:f['x']+192, 3]
            ys, xs = np.nonzero(a)
            assert len(xs) > 5000 and 0 < xs.min() < xs.max() < 191
            assert 0 < ys.min() and ys.max() == 239
            if version == 6:
                for y in range(106, 120):
                    assert a[y, 84:108].any(), (name, f['id'], 'neck gap')
        assert m['animations']['walk']['frames'] == list(range(4, 12))
        assert m['animations']['walk']['fps'] == 10
        idle = m['animations']['idle']
        assert set(idle['frames']) == set(range(4))
        assert len(idle['frames'])/idle['fps'] == 3
        if version == 6:
            assert idle['frames'] == [0,0,1,1,2,2,2,2,3,3,0,0] and idle['fps'] == 4
            assert b'Artwork version 6' in z.read('PROVENANCE.txt')
    archives.append(dict(file=path.name, bytes=path.stat().st_size, sha256=sha(path.read_bytes()), artworkVersion=version, frames=12, idleMs=3000, walkMs=800))

loops = []
for animation in ('idle', 'walk'):
    for facing in ('right', 'left'):
        path = D / f'{animation}-{facing}.gif'
        assert path.stat().st_size > 0
        with Image.open(path) as im:
            assert im.info['loop'] == 0 and im.size == (816, 584)
            hashes, times = [], []
            # Idle's leading and trailing frame 0 remain separate, and internal
            # holds are coalesced. Verify the actual decoded frame sequence.
            for i in range(im.n_frames):
                im.seek(i)
                im.load()
                hashes.append(sha(im.convert('RGB').tobytes()))
                times.append(im.info['duration'])
            if animation == 'idle':
                assert im.n_frames == 5 and len(set(hashes)) == 4
                assert hashes[0] == hashes[-1]
                assert times == [500,500,1000,500,500]
            else:
                assert im.n_frames == 8 and len(set(hashes)) == 8
                assert times == [100]*8
            loops.append(dict(file=path.name, bytes=path.stat().st_size, sha256=sha(path.read_bytes()), decodedFrames=im.n_frames, durationMs=sum(times), frameDurationsMs=times))

for who in ('dress', 'suit'):
    name = who+'-joyful.character.zip'
    assert (ROOT/'public/samples/polished'/name).read_bytes() == (D/name).read_bytes()

video = D/'independent-player.webm'
assert video.stat().st_size > 0
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', str(video)]))
assert float(probe['format']['duration']) > 45
subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(video), '-f', 'null', '-'], check=True)
result = dict(pngs=records, archives=archives, gifs=loops, independentVideo=dict(file=video.name, bytes=video.stat().st_size, sha256=sha(video.read_bytes()), **probe), browserPlaybackCases=len(index['playback']), sourceAndRendererHashes='verified', legacyV5Hashes='verified')
(D/'file-validation.json').write_text(json.dumps(result, indent=2)+'\n')
print(f"Decoded {len(records)} PNGs, {len(archives)} ZIPs, {len(loops)} GIFs and the full browser recording; source hashes, all frames, timelines and public sample copies match.")
