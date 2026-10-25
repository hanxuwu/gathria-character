#!/usr/bin/env python3
"""Publish reviewed additive expressions and the actual browser-exported shirt.

Patches the existing catalog instead of rebuilding older releases. Original
bank files, item entries, presets, source and registration remain authoritative.
Run --expressions-only before the shirt's browser painting roundtrip, then run
without that flag after copying its actual saved garment into the final path.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/kling-wardrobe/catalog.json'
BASELINE = ROOT / 'artwork/kling-expression-shirt/baseline/catalog.json'
RELEASES = ROOT / 'docs/kling-expression/release-index.json'
SHIRT = ROOT / 'docs/kling-wardrobe/garments/male/midnight-sailor-v1.zip'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest(url, expected):
    path = (ROOT / url.lstrip('/')).resolve()
    assert path.is_relative_to(ROOT) and sha(path) == expected, url
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, path
        return json.loads(archive.read('manifest.json'))


def publish(expressions_only=False):
    baseline = json.loads(BASELINE.read_text())
    current = json.loads(CATALOG.read_text())
    output = copy.deepcopy(current)
    releases = json.loads(RELEASES.read_text())['banks']
    assert len(releases) == 8
    for original in baseline['characters']:
        entry = next(c for c in output['characters'] if c['key'] == original['key'])
        for field in ('characterId', 'sourceUrl', 'registrationUrl', 'templateUrl'):
            assert entry[field] == original[field], f'Changed source identity: {field}'
        # An additive release must never drop or change an earlier material/look.
        for field in ('items', 'presets'):
            actual = {row['id']: row for row in entry[field]}
            assert all(actual.get(row['id']) == row for row in original[field]), field
        for release in [r for r in releases if r['character'] == original['key']]:
            previous, new = release['original'], release['release']
            new_manifest = manifest(new['url'], new['sha256'])
            old_manifest = manifest(previous['url'], previous['sha256'])
            assert new_manifest['id'] == new['bankId']
            assert new_manifest['styles'][:-1] == old_manifest['styles']
            assert new_manifest['styles'][-1]['id'] == 'joyful'
            for field in ('sourceSha256', 'registrationSha256', 'poses', 'padding'):
                assert new_manifest[field] == old_manifest[field], field
            if release['kind'] == 'base':
                old = original['appearanceRevision']
                assert old['bankSha256'] == previous['sha256']
                assert entry['appearanceRevision']['bankSha256'] in (old['bankSha256'], new['sha256'])
                entry['appearanceBankUrl'] = new['url']
                entry['appearanceStyles'] = new['styles']
                entry['appearanceRevision'] = {
                    **old, 'bankId': new['bankId'], 'bankSha256': new['sha256'],
                    'previousBankSha256s': list(dict.fromkeys([*old['previousBankSha256s'], old['bankSha256']])),
                }
            else:
                old = next(b for b in original['appearanceLibraries'] if b['sha256'] == previous['sha256'])
                position = next(i for i, b in enumerate(entry['appearanceLibraries']) if b['sha256'] in (previous['sha256'], new['sha256']))
                entry['appearanceLibraries'][position] = {
                    **new,
                    'previousBankSha256s': list(dict.fromkeys([*old.get('previousBankSha256s', []), old['sha256']])),
                }
    if not expressions_only:
        assert SHIRT.is_file(), 'First finish the actual browser painting roundtrip and retain its saved garment.'
        url = '/' + str(SHIRT.relative_to(ROOT))
        shirt = manifest(url, sha(SHIRT))
        entry = next(c for c in output['characters'] if c['key'] == 'male')
        assert shirt['id'] == 'midnight-sailor-v1' and shirt['slot'] == 'top'
        assert shirt['sourceSha256'] == sha(ROOT / entry['sourceUrl'].lstrip('/'))
        assert shirt['registrationSha256'] == sha(ROOT / entry['registrationUrl'].lstrip('/'))
        item = {k: shirt[k] for k in ('id', 'name', 'slot')}
        item.update(url=url, sha256=sha(SHIRT))
        preset = {'id': 'midnight-sailor', 'name': 'Midnight sailor', 'selection': {
            'top': shirt['id'], 'bottom': 'ochre-chinos-v1', 'fullBody': None, 'shoes': None,
        }}
        for field, row in [('items', item), ('presets', preset)]:
            existing = next((r for r in entry[field] if r['id'] == row['id']), None)
            if existing is None:
                entry[field].append(row)
            else:
                assert existing == row, 'Refuse to silently replace an existing published material.'
    CATALOG.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'appearanceReleases': len(releases), 'shirtIncluded': not expressions_only,
                      'catalogSha256': sha(CATALOG), 'oldItemsAndPresetsPreserved': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expressions-only', action='store_true')
    publish(parser.parse_args().expressions_only)
