#!/usr/bin/env python3
"""Build a complete registered garment from a checked material/pose recipe."""
import argparse,json
from pathlib import Path
from kling_garment_recipe import ROOT,build_variant,digest
p=argparse.ArgumentParser();p.add_argument('recipe',type=Path);p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
if a.output.exists():raise SystemExit('Output already exists; choose a new path/version to preserve released banks.')
data,report=build_variant(json.loads(a.recipe.read_text()),a.root.resolve())
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(data)
report.update(output=str(a.output),sha256=digest(data),bytes=len(data));a.output.with_suffix('.audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='poses'}))
