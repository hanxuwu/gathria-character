#!/usr/bin/env python3
"""Verify the complete, exactly reversible side clothing finish scope."""
import importlib.util
import json
import numpy as np

from kling_side_authoring import ROOT, load_context, sha
import side_finish_audit as audit

spec = importlib.util.spec_from_file_location('finish_side_bank', ROOT / 'scripts/prepare-dual-looks-cloth.py')
bank = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bank)


def main():
    report = json.loads(audit.REPORT.read_text())
    ctx = load_context('female', registration_path=ROOT / 'artwork/kling-side-expansion/templates/female.registration.json')
    assert ctx.source_sha256 == report['sourceSha256']
    changed = 0
    native = 0
    for item in report['items']:
        path = ROOT / item['path']
        revision = audit.asset_revision(path)
        data = path.read_bytes()
        assert sha(data) == revision['sha256'] and len(data) == revision['bytes']
        manifest, _, _, _, frames = bank.read_bank(path)
        old_manifest = audit.validated_previous_manifest(path, manifest)
        assert old_manifest['sourceSha256'] == ctx.source_sha256
        changed_ids = []
        for fid, (patch, owned) in frames.items():
            previous, previous_owned = audit.undo_finish_frame(path, fid, patch, owned)
            delta = np.any(patch != previous, axis=2) | (owned != previous_owned)
            if delta.any():
                changed_ids.append(fid)
                assert not (delta & ctx.protected_mask(fid)).any(), (item['id'], fid, 'Original protected pixels touched')
                changed += int(delta.sum())
            assert not patch[~owned].any()
            assert not previous[~previous_owned].any()
            native += 1
        assert changed_ids == [21, 38, 39]
        print(item['id'], 'native scope, preimage and protected source PASS', flush=True)
    print(json.dumps({'assets': len(report['items']), 'nativeFrames': native, 'modifiedFrames': len(report['items']) * 3, 'changedPixels': changed, 'status': 'PASS'}))


if __name__ == '__main__':
    main()
