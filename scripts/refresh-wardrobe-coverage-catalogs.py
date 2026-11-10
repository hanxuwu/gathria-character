#!/usr/bin/env python3
"""Refresh declared garment archive hashes/sizes in built-in wardrobe catalogs.

By default, write changed catalog files after validating the complete plan.
With --check, report stale fields and exit 1 without writing anything.

Only existing item.sha256, item.bytes, item.byteSize, and item.byteLength fields
are eligible. Source/registration bindings, baseSha256 provenance, selections,
animations, other metadata, and garment ZIP bytes are never changed.
"""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOGS = (
    ("docs/kling-wardrobe/catalog.json", "characters"),
    ("docs/dual-view-wardrobe/assets/catalog.json", "representations"),
    ("docs/dual-tailored/assets/catalog.json", "representations"),
    ("docs/dual-looks-cloth/assets/catalog.json", "representations"),
    ("docs/paired-polish/assets/catalog.json", "representations"),
)
FIELDS = ("sha256", "bytes", "byteSize", "byteLength")


def archive_metadata(url):
    path = (ROOT / url.removeprefix("/")).resolve()
    if not path.is_relative_to(ROOT) or path.suffix != ".zip":
        raise ValueError(f"Expected a repository garment ZIP: {url}")
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    if manifest.get("format") != "gathria-sprite-garment":
        raise ValueError(f"Referenced archive is not a garment: {url}")
    with path.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    size = path.stat().st_size
    return manifest, {"sha256": checksum, "bytes": size, "byteSize": size, "byteLength": size}


def without_refreshable_fields(catalog, group_key):
    copied = copy.deepcopy(catalog)
    for group in copied[group_key]:
        for item in group["items"]:
            for field in FIELDS:
                item.pop(field, None)
    return copied


def refresh_plan():
    code = (ROOT / "src/wardrobe/dual-view-catalog.ts").read_text()
    imports = set(re.findall(r'from "../../([^"\n]+/catalog\.json)"', code))
    if imports != {path for path, _ in CATALOGS[1:]}:
        raise ValueError("Runtime dual catalogs changed; update this tool's catalog scope.")
    cached, planned, changes = {}, [], []
    for name, group_key in CATALOGS:
        path = ROOT / name
        original = json.loads(path.read_text())
        updated = copy.deepcopy(original)
        changed = False
        for group in updated[group_key]:
            for item in group["items"]:
                url = item["url"]
                if url not in cached:
                    cached[url] = archive_metadata(url)
                manifest, actual = cached[url]
                if manifest["id"] != item["id"] or manifest["slot"] != item["slot"]:
                    raise ValueError(f"Catalog item identity does not match archive: {name}: {url}")
                for field in FIELDS:
                    # Do not extend schemas or invent fields absent from the catalog.
                    if field in item and item[field] != actual[field]:
                        changes.append({
                            "catalog": name, "id": item["id"], "url": url,
                            "field": field, "before": item[field], "after": actual[field],
                        })
                        item[field] = actual[field]
                        changed = True
        if without_refreshable_fields(original, group_key) != without_refreshable_fields(updated, group_key):
            raise AssertionError(f"Refusing unrelated metadata change: {name}")
        if changed:
            planned.append((path, json.dumps(updated, ensure_ascii=False, indent=2) + "\n"))
    return planned, changes, len(cached)


def write_atomic(path, contents):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(contents)
        temporary.chmod(path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Report mismatches without writing.")
    args = parser.parse_args()
    planned, changes, archive_count = refresh_plan()
    if not args.check:
        for path, contents in planned:
            write_atomic(path, contents)
    report = {
        "mode": "check" if args.check else "write",
        "catalogsInspected": len(CATALOGS), "uniqueGarmentArchives": archive_count,
        "changedCatalogs": [str(path.relative_to(ROOT)) for path, _ in planned],
        "changedFields": len(changes), "changes": changes,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if args.check and changes else 0


if __name__ == "__main__":
    raise SystemExit(main())
