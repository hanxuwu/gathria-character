# Sailor shirt fitting iterations

These are offline donor-registration previews. They are not application exports
and are not evidence of final user art approval.

| Run | Change | Decision |
| --- | --- | --- |
| `prototype-v1` | Initial camp-shirt sampling axes, coarse inner donor-neck trace and warm-pixel exclusion. | Rejected: ivory collar and tie chipped; cuff stripes frayed against the source skin boundary. |
| `prototype-v2` | Expanded the outer collar trace and moved sleeve sampling endpoints beyond the painted cuff. | Rejected: retained a reddish generated neckline contour; color-based skin rejection still removed shaded ivory. Parameters retained in `source/shirt/donor-trial-v2.json`. |
| `prototype-v3` | Replaced color-based skin exclusion with explicit donor-neck polygon; tightened sleeve trace. | Intermediate: collar, tie and cuffs improved, but a few neighboring cuff pixels entered the torso at its flanks. Parameters retained in its `donor.json`. |
| `prototype-v4` | Tightened torso traces to exclude neighboring cuff trim and belt. | Selected for the full 88-pose bank and application review. All native/2x previews and initial-vs-refined comparisons remain. |

Every iteration retains the complete Teal joined sleeve V5 ownership and alpha.
The initial donor parameters remain in `source/shirt/donor-initial.json`; each
selected/latest run records its exact donor hash and per-pose audit. The V2/V3
preview PNGs were removed after review, while their audit/parameter records
remain. V1 and V4 comparisons remain available for direct review.

V4 keeps the ivory stripes inside the cuff with a navy margin, preserves shaded
ivory, and excludes the generated neck by an explicit trace. The fixed source
U-shaped neck and shoulder overlap still limit the donor's V-shaped collar.
The crossed-arm pose has a soft cream shoulder highlight from that fit; this
is not presented as perfect collar anatomy or cloth simulation.

`final-v1/midnight-sailor-template-v1.zip` is the complete template bank for the
browser's painting-kit roundtrip. Only its browser-saved final garment is
intended for the default library.
