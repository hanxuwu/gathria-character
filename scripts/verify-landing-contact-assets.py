#!/usr/bin/env python3
"""Require a new landing motion edition to preserve every visual asset exactly.

Extends the general candidate lineage audit, which permits selected artwork
corrections. This motion-only audit permits no changed source/garment pixels,
registration geometry, appearance data, PNG bytes or source manifest bytes.
It reads both asset directories and writes only the requested external report.
"""
import argparse
import importlib.util
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    before, after, report = (path.resolve() for path in (args.before, args.after, args.report))
    if report.is_relative_to(before) or report.is_relative_to(after):
        parser.error("Report must be outside both read-only asset directories")
    spec = importlib.util.spec_from_file_location(
        "candidate_audit", Path(__file__).with_name("verify-landing-candidate-edition.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    audit = module.Audit(before, after, 0, {name: [] for name in module.GARMENTS.values()})
    audit.part("edition", audit.run)
    audit.report["format"] = "gathria-landing-contact-motion-only-audit"
    audit.report["policy"]["sourceAllowedFrames"] = []

    def strict():
        audit.check(audit.report["source"]["changedFrames"] == [],
                    "motion-only-source-change", "All 109 source RGBA frames must remain exact")
        audit.check(audit.report["registration"]["changedFrames"] == [],
                    "motion-only-registration-change", "All 109 registration geometries must remain exact")
        audit.check(audit.sources[0].files["manifest.json"] == audit.sources[1].files["manifest.json"],
                    "motion-only-source-manifest-change", "The complete source manifest must remain byte-exact")
        entries = []
        for filename in ["male.source.zip", "male.appearance.zip", *module.GARMENTS.values()]:
            left, right = [module.Archive(directory / filename) for directory in (before, after)]
            names = {name for name in left.files if name.endswith(".png")}
            audit.check(names == {name for name in right.files if name.endswith(".png")},
                        "motion-only-png-inventory-change", "PNG inventory must remain exact", archive=filename)
            for name in sorted(names):
                exact = left.files[name] == right.files.get(name)
                entries.append({"archive": filename, "file": name, "byteExact": exact})
                audit.check(exact, "motion-only-png-change", "Every PNG entry must remain byte-exact",
                            archive=filename, file=name)
        audit.report["visualAssetEntries"] = entries

    audit.part("motion-only", strict)
    audit.report["passed"] = not audit.errors
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(audit.report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": audit.report["passed"], "errors": len(audit.errors), "report": str(report)}))
    return 0 if audit.report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
