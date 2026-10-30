"""Reproduce the separate tailored registrations from source-bound reviews.

Run from the repository root. This never writes the frozen source/registration.
Manual polygons in the review packets are the input; this does not infer anatomy.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / 'scripts'))
from kling_side_authoring import load_context, apply_registration_reviews

BASE = Path('artwork/kling-side-expansion/templates')
for identity in ('male', 'female'):
    ctx = load_context(identity)
    if identity == 'male':
        changes = json.loads((BASE / 'source-review/male-hands/proposals.json').read_bytes())['changes']
        for packet in ('male-hands/concave-refinements.json', 'qa-male-hand-refinement.json', 'qa-male-run-boundary-refinement.json', 'qa-male-walk-boundary-refinement.json'):
            for refinement in json.loads((BASE / 'source-review' / packet).read_bytes()):
                item = next(c for c in changes if (c['frameId'], c['label']) == (refinement['frameId'], refinement['label']))
                item['polygon'] = refinement['polygon']
                item['reason'] = refinement['reason']
                item['contactBoundaryRefinement'] = refinement
        changes += json.loads((BASE / 'source-review/male-jump-head-corrections.json').read_bytes())
    else:
        changes = json.loads((BASE / 'source-review/qa-female/proposals.json').read_bytes())
        for refinement in json.loads((BASE / 'source-review/female-anchor-refinements.json').read_bytes()):
            item = next(c for c in changes if c['frameId'] == refinement['frameId'] and c['label'] == 'farHand')
            item.setdefault('pointUpdates', {})[refinement['point']] = refinement['after']
            item['anchorRefinements'] = [refinement]
            item['reason'] += ' ' + refinement['reason']
    audit = apply_registration_reviews(ctx, changes, BASE / f'{identity}.registration.json')
    (BASE / f'{identity}.registration-audit.json').write_text(json.dumps(audit, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(identity, audit['registrationSha256'])
