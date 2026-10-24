# Cloth contours, Sprints 26–27

The two original Kling sources, head banks and registrations are unchanged.
These files are additive clothing derivatives, not layers recovered from video.

## Male cuff

`source/male-cuff-reference.png` is the actual prior application export, source
pose 56. `source/male-cuff-donor.png` is an OpenAI image edit made on 2026-10-24.
The edit also changed unrelated illustrated features; **none of that generated
anatomy is used**. Only a narrow navy/ivory cuff strip supplies RGB in the existing
native sleeve. The recorded prompt and SHA256 values are in `source/provenance.json`.

`scripts/prepare-kling-contours.py` traces the donor's curved inner cuff and maps
it to the original wrist. The item-scoped V2 hand review preserves all of V5's
protected fist and restores a small curved rim of original wrist. It never
copies generated skin. All other 87 male poses and the final body alpha remain
exact. The correct binding is the `male-full-outfits-v1` registration; the older
`male` template is a different contract and is not used for the released bank.

## Female waist

The existing V7 cloth and its previously recorded native donor are reused. The
remaining small right-waist steps came from the garment's alpha/ownership edge,
so another interior repaint would not repair them. A local row-edge fit moves
only the edge neighborhood during compressed poses (83–89 and 102–109). Existing
RGBA, including fractional alpha, travels with the edge; the entire dress is
not blurred. The displacement is capped at six native pixels and fades to zero
at the ends of the repair window.

Ownership continues to cover removed old cloth to avoid exposing the underlying
tank. Any new ownership is limited to empty source background. Source head/hands
and unowned body pixels are excluded. Two independently versioned banks preserve
V7 and every other pose. This is a small silhouette correction, not a change to
the body proportions or action timing.

Prepared offline images explain authoring only. Acceptance uses the actual
application exports in `docs/kling-contour-review`.
