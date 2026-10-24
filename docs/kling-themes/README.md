# Character themes

This batch adds a separate **Character themes** workspace for both Kling
characters. It retains their original drawings and introduces an independently
authored **Pixel storybook** theme. Both themes have a tank-and-shorts look and
a wedding look, with idle, walk, run, jump and celebrate actions.

The theme choices are complete artwork banks. They do not convert every existing
wardrobe item into a new style. The existing wardrobe, hair/face editing, sprite
action editor and optional skeleton tools remain available in their own tabs.

## Open it

Run `npm ci` and `npm run dev`, then open the address Vite prints.

1. In **Character library**, choose **Explore Kling male themes** or
   **Explore Kling female themes**. Alternatively, open the workbench and its
   **Character themes** tab.
2. Choose **Kling original** or **Pixel storybook**.
3. Choose **Tank & shorts** or the wedding variant under **Look**.
4. Pick an action and direction, then play, pause or scrub. Use **Compare Kling
   original** for a matching-outfit comparison.

Direct routes:

- `/workbench.html?character=male&mode=themes`
- `/workbench.html?character=female&mode=themes`

**Keep motion phase** is on by default. Same-character theme/look changes keep
the action, facing, relative timeline position and play/pause state. Loading
holds the accepted pose; the new drawing and phase appear together when ready.
A completed one-shot remains at its final frame. Different loop semantics pause
at the mapped pose. This maps timeline progress, not inferred body geometry;
there is no crossfade, skeleton deformation or invented intermediate pose.

**Restore Kling original** explicitly resets to the base tank-and-shorts look,
idle, first frame and paused playback. Clicking the original theme card instead
retains the requested look and motion phase. This makes wedding-to-wedding
comparison possible without silently changing clothes.

## Keep and export your work

| Download                   | Contents and use                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Save theme session         | Self-contained themes, exact revisions, selected character/look/action/facing. Open with **Open theme session**. Playback reopens paused at the first frame. |
| Download theme             | A versioned `.theme.zip` containing every look in that theme. Open with **Import theme**.                                                                    |
| Export theme CharacterPack | The selected look's exact accepted ZIP, all five actions. Open in `/player.html` without the workbench.                                                      |
| Export theme PNG           | Native RGBA frame, with the selected direction. No presentation scaling.                                                                                     |
| Export theme GIF           | Declared action sequence and timing, with the selected direction. Pixel frames stay native; smooth originals use half-size presentation.                     |

GIF uses a cream matte and a palette because GIF cannot retain the PNG's full
RGBA color/alpha range. The PNG and CharacterPack remain the source of truth.
Looping actions repeat; a jump holds its last drawing instead of being forced
into a seamless loop.

An imported theme missing the requested look keeps that request visible and
asks for an available look. Missing actions are disabled. Failed or canceled
imports retain the last accepted session. An import cannot replace a published
theme revision with different artwork under the same key.

## Artwork and registration

The original base look embeds the existing male/female motion CharacterPack
**byte for byte**. The original wedding look embeds the previous actual
application export from the painting round-trip batch. That wedding artwork is
a clothing/hair composite, not raw source-video footage.

The pixel drawings were produced with OpenAI image generation using the Kling
identity references, a pixel style guide and the actual retained pose guides.
Each character/look has 32 authored drawings: four idle, eight walk, eight run,
eight jump and four celebrate. Repeated timeline holds are separate from the
count of unique drawings. The generated art is a new interpretation and does
not inherit visual approval of the original video.

All pixel variants use **192×272** native frames and anchor **(96,251)**. The
technical pipeline crops reviewed cells, registers poses by integer translation,
uses the same 2:1 sampling and transparent headroom for all poses, then packs an
atlas. It does not independently resize limbs or fit each silhouette. Left
playback mirrors the complete right-facing frame.

The preparation records retain the original high-resolution sheets, pose guides,
source hashes, generation prompts where recorded, selected crop rectangles,
translations, sampling, anchors and exact action timelines.

- [Artwork provenance and build commands](../../artwork/kling-themes/README.md)
- [Published catalog hashes](../../artwork/kling-themes/catalog-index.json)
- [Theme and CharacterPack downloads](bundles/)

## Compatibility

Authored pixel packs use **CharacterPack V4**, with explicit nearest-neighbor,
integer display scaling and native anchors. Existing V2/V3 smooth packs keep
their previous rendering and export behavior. V4 supports explicit atlas page
references and up to four pages. It does not pretend to be an editable wardrobe
or source-video extraction; older players without V4 need to be updated.

Theme V1 is a checked envelope around portable CharacterPacks. Logical look IDs
map corresponding outfits across themes, while the actual native resolution,
anchor, pages and action timing belong to each pack. Adding a theme requires
authored assets for its supported looks; a shader or one standing image does
not supply a complete motion bank.

Bundles are bounded at 128 MiB and eight looks. A portable session holds up to
eight revisions within 256 MiB. Every embedded pack, PNG and hash is validated.
Published theme identities are bound to catalog hashes even before loading.
Large valid packs can exceed a preview canvas budget; the UI explains that
limit and retains the original bytes and pack export instead of silently
resampling them.

Native/integer preview preserves pixel sampling. The optional comparison
normalizes the original's display height and aligns declared anchors; it is a
presentation view, not a resized export or a guarantee of identical poses.

## Review and limitations

The actual production export review and newly executed verification are recorded
in [RESULTS.md](RESULTS.md). Source sheets and technical registration studies
are kept separately from application-exported review images.

- This release supplies **two themes × two characters × two complete looks**.
  It does not convert the whole existing wardrobe or provide arbitrary runtime
  style transfer. New themes/look variants need their own authored pose banks.
- The new pixel motion uses authored key poses, so it has fewer unique drawings
  and its own timing. Idle is intentionally quiet; it is not a newly verified
  blink animation. Small face, hair and clothing-detail changes between generated
  drawings still require visual review.
- Normalized phase preserves progress; it does not make two independently drawn
  actions anatomically identical at every switch. No claim of perfectly smooth
  motion or final user visual approval is made.
- Theme ZIPs embed the exact original packs for portable restore. They are larger
  than the new pixel packs; first loading the original remains download-bound.
- Theme work is isolated from the earlier wardrobe changes in draft PR #39.
  This batch does not merge that PR or deploy the app.

All generation occurs during asset authoring. Playback, switching, imports and
exports run locally in the browser, with no runtime image-generation API.
