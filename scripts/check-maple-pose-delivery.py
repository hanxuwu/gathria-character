"""Verify the delivered source/prepared/review files, not just their existence."""
from pathlib import Path
from PIL import Image
import hashlib
import io
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/maple-action-poses/delivery-integrity.json'
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda path: json.loads(path.read_text())
final = ROOT / 'docs/maple-action-poses/final'
prepared = ROOT / 'artwork/maple-action-poses/prepared'
evidence = read(final / 'evidence-index.json')
for name, expected in evidence['sourceFiles'].items():
    assert sha((ROOT / name).read_bytes()) == expected, name
for name, expected in evidence['preparedInputFiles'].items():
    assert sha((prepared / name).read_bytes()) == expected, name
registration = read(prepared / 'registration.json')
assert sha((ROOT / registration['source']['path']).read_bytes()) == registration['source']['sha256']
for name, expected in registration['files'].items():
    assert sha((prepared / name).read_bytes()) == expected, name
for name, expected in registration['baseline'].items():
    assert sha((ROOT / 'artwork/generated-traveler/prepared' / name).read_bytes()) == expected, name
# The media compositor inventory also covers its own report and README.
for item in read(final / 'file-integrity.json')['files']:
    assert sha((final / item['file']).read_bytes()) == item['sha256'], item['file']

files = set()
for folder in ('artwork/maple-action-poses', 'docs/maple-action-poses'):
    files.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
files.add(ROOT / 'docs/MAPLE_ACTION_POSES_REVIEW.md')
for name in ('prepare-maple-action-poses.mjs', 'generate-maple-pose-evidence.mjs',
             'render-maple-pose-review.py', 'diagnose-maple-knees.mjs',
             'render-maple-knee-diagnostics.py', 'check-maple-pose-delivery.py'):
    files.add(ROOT / 'scripts' / name)
files.discard(OUT)
report = {'scope': 'New source, prepared imports, review exports, diagnostic evidence, review doc and reproduction scripts; excludes this inventory.',
          'capturedRuntimeAndInputHashesMatch': True, 'baselinePreparationHashesMatch': True,
          'files': [], 'counts': {}}
for path in sorted(files):
    data = path.read_bytes()
    assert data, path
    ext = path.suffix.lower().removeprefix('.')
    item = {'file': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha(data)}
    report['counts'][ext] = report['counts'].get(ext, 0) + 1
    if ext in ('png', 'gif'):
        with Image.open(path) as image:
            item.update(dimensions=list(image.size), frames=image.n_frames)
            durations = []
            for frame in range(image.n_frames):
                image.seek(frame); image.load()
                assert image.getbbox() is not None, path
                if prepared in path.parents:
                    assert image.size == (192, 256) and image.mode == 'RGBA'
                    assert set(image.getchannel('A').tobytes()) == {0, 255}
                if ext == 'gif':
                    duration = image.info['duration']
                    assert duration > 0
                    durations.append(duration)
            if durations:
                item.update(frameDurationsMs=durations, durationMs=sum(durations),
                            loop=image.info.get('loop', 'one-shot'))
    elif ext == 'zip':
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None, path
            names = archive.namelist()
            assert names and len(names) == len(set(names))
            for name in names:
                value = archive.read(name)
                assert value, (path, name)
                if name.endswith('.png'):
                    with Image.open(io.BytesIO(value)) as image:
                        image.load()
                        assert image.mode == 'RGBA' and image.getbbox() is not None
                        assert set(image.getchannel('A').tobytes()) == {0, 255}
                elif name.endswith('.json'):
                    json.loads(value)
                else:
                    value.decode('utf-8')
            item.update(crcVerified=True, allMembersDecoded=True, memberCount=len(names))
    elif ext == 'json':
        json.loads(data)
    else:
        data.decode('utf-8')
    report['files'].append(item)
OUT.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'files': len(report['files']), 'counts': report['counts'], 'hashesMatch': True}))
