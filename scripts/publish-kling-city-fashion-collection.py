#!/usr/bin/env python3
"""Append the six city-fashion garments/presets without rebuilding published history."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/kling-wardrobe/catalog.json'
DEFINITIONS = ROOT / 'artwork/kling-collection/source/city-fashion-v1/looks.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def append_exact(entry, field, row):
    existing = next((item for item in entry[field] if item['id'] == row['id']), None)
    if existing is None:
        entry[field].append(row)
    else:
        assert existing == row, f'Refuse to replace published {field}/{row["id"]}'



def verify_owner_audit(look, manifest, digest):
    character, item_id = look['character'], look['garmentId']
    folder = ROOT / f'artwork/kling-collection/prepared/city-fashion-v1/{character}'
    if character == 'male':
        index_path = folder / 'release-index.json'
        index = json.loads(index_path.read_text())
        published = next(row for row in index['items'] if row['id'] == item_id)
        assert published['sha256'] == digest
        audit_path = ROOT / published['audit']
        audit = json.loads(audit_path.read_text())
        frames = [row for row in audit['poses'] if row['item'] == item_id]
        assert all(row.get('ownershipExact') is True and row.get('alphaExact') is True
                   and row.get('protectedExact') is True for row in frames)
        assert audit['baselineSha256'] == look['baseGarmentSha256']
    else:
        audit_path = folder / 'asset-audit.json'
        audit = json.loads(audit_path.read_text())
        published = next(row for row in audit['items'] if row['id'] == item_id)
        assert published['sha256'] == digest
        assert published['slot'] == look['garmentSlot']
        assert published['baseSha256'] == look['baseGarmentSha256']
        assert audit['baselines'][item_id]['sha256'] == look['baseGarmentSha256']
        assert audit['baselines'][item_id]['slot'] == look['garmentSlot']
        frames = published['frames']
        assert all(row.get('alphaChanges') == 0 and row.get('ownershipChanges') == 0
                   and row.get('sourceOutsideOwnershipChanges') == 0 for row in frames)
    assert audit['prototype'] is False, 'A prototype audit cannot authorize final publication.'
    assert audit['sourceSha256'] == manifest['sourceSha256']
    assert audit['registrationSha256'] == manifest['registrationSha256']
    assert len(frames) == len(manifest['frames'])
    assert {row['frameId'] for row in frames} == {row['frameId'] for row in manifest['frames']}
    return {'file': str(audit_path.relative_to(ROOT)), 'sha256': sha(audit_path), 'checkedPoses': len(frames)}


def publish(check=False):
    before_bytes = CATALOG.read_bytes()
    before = json.loads(before_bytes)
    output = copy.deepcopy(before)
    looks = json.loads(DEFINITIONS.read_text())
    assert len(looks) == 6 and len({look['id'] for look in looks}) == 6
    assert all(sum(look['character'] == c for look in looks) == 3 for c in ('male', 'female'))
    releases = []
    for look in looks:
        entry = next(c for c in output['characters'] if c['key'] == look['character'])
        garment_id = look['garmentId']
        path = ROOT / f'docs/kling-wardrobe/garments/{look["character"]}/{garment_id}.zip'
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None, path
            manifest = json.loads(archive.read('manifest.json'))
        assert manifest['id'] == garment_id
        assert manifest['slot'] == look['garmentSlot']
        assert look['selection'][look['garmentSlot']] == garment_id
        base_entry = next(i for i in entry['items'] if i['id'] == look['baseGarmentId'])
        assert base_entry['slot'] == look['garmentSlot']
        base_path = ROOT / base_entry['url'].lstrip('/')
        assert sha(base_path) == base_entry['sha256'] == look['baseGarmentSha256']
        with zipfile.ZipFile(base_path) as archive:
            baseline = json.loads(archive.read('manifest.json'))
        for field in ('slot', 'sourceSha256', 'registrationSha256', 'characterId',
                      'frameWidth', 'frameHeight', 'frames', 'pages'):
            assert manifest[field] == baseline[field], f'{garment_id}: changed baseline {field}'
        owner = verify_owner_audit(look, manifest, sha(path))
        assert manifest['characterId'] == entry['characterId']
        assert manifest['sourceSha256'] == sha(ROOT / entry['sourceUrl'].lstrip('/'))
        assert manifest['registrationSha256'] == sha(ROOT / entry['registrationUrl'].lstrip('/'))
        item = {key: manifest[key] for key in ('id', 'name', 'slot')}
        item.update(url='/' + str(path.relative_to(ROOT)), sha256=sha(path))
        append_exact(entry, 'items', item)
        for slot, selected in look['selection'].items():
            assert selected is None or any(i['id'] == selected and i['slot'] == slot for i in entry['items'])
        assert set(look['selection']) == {'top', 'bottom', 'fullBody', 'shoes'}
        assert not (look['selection']['fullBody'] and (look['selection']['top'] or look['selection']['bottom']))
        libraries = entry.get('appearanceLibraries', [])
        bank = next((b for b in libraries if any(s['id'] == look['hair'] and s['slot'] == 'hair' for s in b['styles'])), None)
        styles = bank['styles'] if bank else entry['appearanceStyles']
        assert any(s['id'] == look['hair'] and s['slot'] == 'hair' for s in styles)
        assert look['face'] is None or any(s['id'] == look['face'] and s['slot'] == 'face' for s in styles)
        assert look['color'] in ('chestnut', 'espresso', 'copper')
        # Wardrobe presets intentionally change clothing only. Styled appearance
        # is declared in the collection recipe and actual saved-project exports.
        append_exact(entry, 'presets', {k: look[k] for k in ('id', 'name', 'selection')})
        releases.append({'character': look['character'], 'look': look['id'], 'item': item, 'baseGarmentId': look['baseGarmentId'], 'baseGarmentSha256': look['baseGarmentSha256'], 'ownerAudit': owner})
    for original in before['characters']:
        current = next(c for c in output['characters'] if c['key'] == original['key'])
        for field, value in original.items():
            if field in ('items', 'presets'):
                assert current[field][:len(value)] == value
            else:
                assert current[field] == value, field
    assert CATALOG.read_bytes() == before_bytes, 'Catalog changed during publication.'
    if not check and output != before:
        CATALOG.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'checkedOnly': check, 'looks': releases,
                      'catalogBeforeSha256': hashlib.sha256(before_bytes).hexdigest(),
                      'catalogAfterSha256': sha(CATALOG), 'oldRowsExact': True}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate ready assets without writing the catalog.')
    publish(parser.parse_args().check)
