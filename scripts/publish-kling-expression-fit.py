#!/usr/bin/env python3
"""Publish additive face/cloth refinements without rebuilding historical catalogs."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/kling-wardrobe/catalog.json'
BASELINE = ROOT / 'artwork/kling-expression-fit/baseline/catalog.json'
RELEASES = ROOT / 'docs/kling-expression-refined/release-index.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_bank(url, expected=None):
    path = (ROOT / url.lstrip('/')).resolve()
    assert path.is_relative_to(ROOT) and path.is_file(), url
    if expected:
        assert sha(path) == expected, url
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, url
        return json.loads(archive.read('manifest.json'))


def append_exact(entry, field, row):
    previous = next((r for r in entry[field] if r['id'] == row['id']), None)
    if previous is None:
        entry[field].append(row)
    else:
        assert previous == row, f'Refuse to replace published {field}/{row["id"]}'


def publish(expressions_only=False):
    baseline = json.loads(BASELINE.read_text())
    current = json.loads(CATALOG.read_text())
    output = copy.deepcopy(current)
    releases = json.loads(RELEASES.read_text())['banks']
    assert len(releases) == 8
    for original in baseline['characters']:
        entry = next(c for c in output['characters'] if c['key'] == original['key'])
        for field in ('characterId', 'sourceUrl', 'registrationUrl', 'templateUrl'):
            assert entry[field] == original[field], field
        for field in ('items', 'presets'):
            actual = {r['id']: r for r in entry[field]}
            assert all(actual.get(r['id']) == r for r in original[field]), field
        for release in [r for r in releases if r['character'] == original['key']]:
            old, new = release['original'], release['release']
            old_manifest = load_bank(old['url'], old['sha256'])
            new_manifest = load_bank(new['url'], new['sha256'])
            assert new_manifest['id'] == new['bankId']
            assert new_manifest['styles'][:-2] == old_manifest['styles']
            assert [s['id'] for s in new_manifest['styles'][-2:]] == ['gentle-v2', 'joyful-v2']
            for field in ('sourceSha256', 'registrationSha256', 'poses', 'padding'):
                assert new_manifest[field] == old_manifest[field], field
            assert len(new_manifest['pages']) <= 8
            assert sum(p['width'] * p['height'] for p in new_manifest['pages']) <= 64 * 1024**2
            if release['kind'] == 'base':
                previous = original['appearanceRevision']
                assert previous['bankSha256'] == old['sha256']
                assert entry['appearanceRevision']['bankSha256'] in (old['sha256'], new['sha256'])
                entry['appearanceBankUrl'] = new['url']
                entry['appearanceStyles'] = new['styles']
                entry['appearanceRevision'] = {
                    **previous, 'bankId': new['bankId'], 'bankSha256': new['sha256'],
                    'previousBankSha256s': list(dict.fromkeys([
                        *previous['previousBankSha256s'], old['sha256'],
                    ])),
                }
            else:
                previous = next(b for b in original['appearanceLibraries'] if b['sha256'] == old['sha256'])
                position = next(i for i, b in enumerate(entry['appearanceLibraries']) if b['sha256'] in (old['sha256'], new['sha256']))
                entry['appearanceLibraries'][position] = {
                    **new, 'previousBankSha256s': list(dict.fromkeys([
                        *previous.get('previousBankSha256s', []), old['sha256'],
                    ])),
                }

    if not expressions_only:
        for character, garment_id, presets in [
            ('male', 'midnight-sailor-v2', [
                ('midnight-sailor-refined', 'Midnight sailor refined', 'ochre-chinos-v1'),
            ]),
            ('female', 'plum-pintuck-top-v1', [
                ('plum-pintuck-day', 'Plum pintuck day', 'navy-shorts'),
                ('plum-pintuck-ochre', 'Plum pintuck ochre', 'ochre-shorts'),
            ]),
        ]:
            entry = next(c for c in output['characters'] if c['key'] == character)
            url = f'/docs/kling-wardrobe/garments/{character}/{garment_id}.zip'
            path = ROOT / url.lstrip('/')
            manifest = load_bank(url)
            assert manifest['id'] == garment_id and manifest['slot'] == 'top'
            assert manifest['characterId'] == entry['characterId']
            assert manifest['sourceSha256'] == sha(ROOT / entry['sourceUrl'].lstrip('/'))
            assert manifest['registrationSha256'] == sha(ROOT / entry['registrationUrl'].lstrip('/'))
            item = {k: manifest[k] for k in ('id', 'name', 'slot')}
            item.update(url=url, sha256=sha(path))
            append_exact(entry, 'items', item)
            for preset_id, name, bottom in presets:
                assert any(i['id'] == bottom and i['slot'] == 'bottom' for i in entry['items'])
                append_exact(entry, 'presets', {
                    'id': preset_id, 'name': name,
                    'selection': {'top': garment_id, 'bottom': bottom, 'fullBody': None, 'shoes': None},
                })

    CATALOG.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'appearanceReleases': len(releases),
                      'garmentsIncluded': not expressions_only,
                      'catalogSha256': sha(CATALOG), 'oldItemsAndPresetsExact': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expressions-only', action='store_true')
    publish(parser.parse_args().expressions_only)
