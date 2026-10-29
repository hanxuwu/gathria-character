# Independent female registration review

Reviewed all 102 native source frames against the old head/hand overlays. These are explicit source-bound correction proposals for the separate expansion registration; the original source and original registration were not edited.

`proposals.json` in the matching artwork directory carries 150 region edits over 81 frames, exact source RGBA SHA-256, old polygon, proposed polygon, reasons, and directly observed wrist guides. The remaining 21 frames retain their old regions. All 16 idle rear hands were moved from the thigh onto the actual small fist. Walk/run hand drift and jump head/shoulder floods were corrected. Raised far fists are explicitly protected after removing the old head flood that had mistakenly covered them.

The seven `proposal-*.jpg` sheets show every affected frame at native crop scale. `selected-source-old-proposal.jpg` places unchanged source, old protection and proposed protection side by side. Green is head/neck, red is near hand, and blue is far hand. These diagnostic overlays are alpha-clipped for readability; the runtime uses polygon pixel centers intersected with any nonzero source alpha.

Manual hand contours include a three-pixel conservative margin after the initial native review so that blurred fingers and antialiased ink are retained. Wrist points are authoring guides, not exact skeletal tracking. The lower head arc follows directly observed jaw/neck boundaries; upper source head contours are retained. The template agent must review the consolidated registration and dressed output before publication.

Source blur and cutout drift remain visible in jump source 201–204, 210–213, 218–221, 233–234 and 241–244. Registration changes do not restore source detail or alter anatomy. The green source fringe under the jaw/at the neck is retained.

Follow-up native thumb/palm review found 36 further far-hand truncations. The final proposal restores the thumb/palm alongside the old protected finger contour, with explicit per-pose source limits; see `thumb-palm-source-old-proposal.jpg`. No anatomy is redrawn.
