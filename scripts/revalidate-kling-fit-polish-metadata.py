#!/usr/bin/env python3
"""Revalidate display-name-only packaging after the full immutable pixel audit.

No composition result is silently reused against different decoded art. Every
current candidate pose must match both audited RGBA and ownership hashes.
The final female authoring script is sampled again against its renamed banks.
"""
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path

from kling_wardrobe_common import ROOT, sha

spec = importlib.util.spec_from_file_location("fit_asset_audit", ROOT / "scripts/verify-kling-fit-polish-assets.py")
audit = importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)
folder = ROOT / "docs/kling-wardrobe/fit-polish/verification"
source = folder / "assets.json"
previous = folder / "assets-before-display-names.json"
assert not previous.exists(), "Do not overwrite the preserved initial audit"
original = source.read_bytes(); report = json.loads(original)
assert report["passed"] is True
previous.write_bytes(original)
catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_text())
changes = []
for row in report["garments"]:
    entry = next(e for e in catalog["characters"] if any(item["id"] == row["id"] for item in e["items"]))
    catalog_item = next(item for item in entry["items"] if item["id"] == row["id"])
    assert catalog_item["url"].lstrip("/") == row["file"]
    registration = (ROOT / entry["registrationUrl"].lstrip("/")).read_bytes()
    bank = audit.Garment(ROOT / row["file"], registration)
    try:
        assert bank.manifest["id"] == row["id"] and bank.manifest["slot"] == row["slot"]
        assert bank.manifest["name"] == catalog_item["name"]
        for frame in row["frames"]:
            rgba, owned = bank.frame(frame["frameId"])
            assert sha(rgba.tobytes()) == frame["rgbaSha256"], (row["id"], frame["frameId"], "art changed during metadata update")
            assert sha(owned.tobytes()) == frame["ownershipSha256"], (row["id"], frame["frameId"], "ownership changed during metadata update")
        current = audit.describe(ROOT / row["file"])
        changes.append({"file": row["file"], "previousSha256": row["sha256"], "currentSha256": current["sha256"], "checkedPoses": len(row["frames"]), "rgbaAndOwnershipExact": True, "zipCrcAndPngDecodeValid": True, "displayName": bank.manifest["name"]})
        row.update(current)
    finally:
        bank.close()
for row in report["sourceBindings"]:
    for key in ["source", "registration", "template"]:
        assert audit.describe(ROOT / row[key]["file"]) == row[key]
for row in report["immutableInputs"]:
    assert sha((ROOT / row["file"]).read_bytes()) == row["sha256"], row["file"]
for look in report["outfits"]:
    if look["look"] not in ["day", "wedding"]: continue
    entry = next(e for e in catalog["characters"] if e["key"] == look["character"])
    preset = next(p for p in entry["presets"] if p["id"] == look["look"])
    assert look["selection"] == preset["selection"]
report["determinism"].update(audit.female_determinism(catalog))
report["catalog"] = audit.describe(ROOT / "docs/kling-wardrobe/catalog.json")
report["finalMetadataRevalidation"] = {"completedAt": datetime.now(timezone.utc).isoformat(), "initialAudit": audit.describe(previous), "script": audit.describe(Path(__file__)), "garments": changes, "immutableSourceInputsExact": True, "defaultSelectionsUnchanged": True, "femaleAuthoringSamplesRepeatedAgainstFinalArchives": True, "scope": "Current ZIP CRCs, strict manifest/registration binding, and all candidate PNG/ownership decoded pixels were rechecked. Full source-body and mixed-look checks are explicitly reused from the preserved initial audit because their decoded inputs match exactly."}
source.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"passed": True, "revalidatedPoses": sum(e["checkedPoses"] for e in changes), "femaleRepeatSamples": len(report["determinism"]["femaleSamples"]), "catalog": report["catalog"], "report": str(source.relative_to(ROOT))}))
