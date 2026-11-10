#!/usr/bin/env python3
"""Freeze strict historical paired-item identities without copying artwork."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE='5d63ae233ca83e61dc354e122a8708044f4e2653'
COVERAGE='2a7207983a5fb8a2991ba2f79263b2da12a1a103'
OUT=ROOT/'artwork/wardrobe-finish/paired-garment-revisions.json'

def build():
    raw=(ROOT/'artwork/wardrobe-finish/baseline-bindings.json').read_bytes()
    assert hashlib.sha256(raw).hexdigest()=='ced6d00694c81d3d917fd6688c37a5f275c12b768f5c17e762d9afbf9eeac0e2', 'Frozen 2a bindings changed'
    frozen=json.loads(raw)
    assert frozen['commit']==COVERAGE
    prior={r['path']:r for r in frozen['garments']}
    result=[]
    for outfit,directory in [('cotton-day','dual-view-wardrobe'),('tailored-day','dual-tailored'),('complete-day','dual-looks-cloth'),('polished-day','paired-polish')]:
        path=f'docs/{directory}/assets/catalog.json'
        catalog=json.loads(subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT))
        for row in catalog['representations']:
            for item in row['items']:
                seed=prior[item['url'].lstrip('/')]
                for key in ['sourceSha256','registrationSha256']:
                    assert seed[key]==row[key]
                assert seed['id']==item['id'] and seed['slot']==item['slot']
                result.append({'outfitId':outfit,'character':row['character'],'view':row['view'],
                    'id':item['id'],'logicalId':item.get('logicalId','cotton-tank' if item['slot']=='top' else 'cotton-shorts'),
                    'slot':item['slot'],'palette':item['palette'],'sourceSha256':row['sourceSha256'],
                    'registrationSha256':row['registrationSha256'],'sha256':sorted({item['sha256'],seed['sha256']})})
    return {'format':'gathria-paired-garment-revisions','version':1,'baselines':[BASE,COVERAGE],
            'scope':'Previously published embedded garments only; current catalog hashes are accepted separately. No automatic artwork migration.',
            'entries':sorted(result,key=lambda r:(r['outfitId'],r['character'],r['view'],r['id']))}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    data=(json.dumps(build(),indent=2)+'\n').encode()
    if args.check:assert OUT.read_bytes()==data,'Historical paired garment registry changed'
    else:OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_bytes(data)
    print(json.dumps({'bindings':len(build()['entries']),'bytes':len(data),'checked':args.check}))
