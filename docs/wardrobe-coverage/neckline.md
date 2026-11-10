# Source-bound neckline cloth review

The side-view female blouse leaves gray undershirt pixels inside an oversized
head-protection polygon in several jump and celebration poses. The pink neck,
face, original neckline ink and one-pixel skin/cloth boundary are retained.
The reviewed cyan interior in
[the native source/current-clothes comparison](review/female-side-neckline-source-review.png)
is original cloth, not skin; magenta marks the conservative boundary that is
not released. This image records diagnosis before garment repairs.

The three additional V3 permission IDs are bound to exact source and registration
SHA-256 values in `artwork/wardrobe-coverage/neckline-profiles-v1.json`:

- `female-original-tailored-neckline-cloth-v1`: reuses the existing six-frame
  source-cloth review after checking that both source and every affected
  protected polygon are identical in the paired original registration.
- `female-side-tailored-neckline-cloth-v1`: 21 native poses, 1,929 reviewed cloth
  pixels in the tailored side registration.
- `female-side-polished-neckline-cloth-v1`: the same inspected cloth map with its
  own exact polished registration binding; it is not an alias for arbitrary
  registrations.

Only an explicit V3 top or full-body garment can use these pixels. Other
head pixels, overlapping hands, old V1/V2 items and mismatched source packs
remain protected. The earlier `female-neckline-cloth-v1` JSON and its hash are
unchanged, so old saved projects retain their original rules. Shared sources,
registrations, animation clips and approved character anatomy are not modified.

No extra permission was added for male side/landing: the reviewed original top
material masks contain no head-protected pixels. Female material/cotton banks
already cover their source cloth and do not need the new profiles.

Reproduce/check the immutable data:

```sh
python scripts/build-wardrobe-neckline-profiles.py --check
npx vitest run src/wardrobe/neckline-permissions.test.ts src/wardrobe/neckline-coverage-permissions.test.ts
```

The review intentionally leaves the thin neckline/skin anti-aliased boundary.
It does not certify natural collar folds or remove all video edge spill.
Garment before/after and exported GIF validation is recorded by the wider
wardrobe coverage audit.
