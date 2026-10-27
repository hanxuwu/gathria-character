# City, campus and retro fashion

Six new painted garments and coordinated looks for the approved Kling characters: three styles, each with a male and female outfit. New clothing uses the reviewed source-pose cuts; the existing faces, proportions, motion clock and earlier wardrobe assets stay reproducible.

Open the library, choose **Dress Kling male / female**, and select the outfit under **Recommended** or search its name. Outfit buttons change clothing only and preserve the current hair and face. These are the complete styling recipes:

| Style | Outfit | New clothing | Existing hair / color | Face |
| --- | --- | --- | --- | --- |
| Urban | Male · City ivory | Ivory utility zip shirt, framed pocket | Swept quiff / Espresso | Natural |
| Urban | Female · City ink | Charcoal utility zip top, ivory binding | Tucked bun / Espresso | Natural |
| Campus | Male · Campus sky | Sky-blue knit polo, broad navy stripes | Soft crop / Chestnut | Gentle smile (refined) |
| Campus | Female · Campus periwinkle | Periwinkle A-line dress, twin ivory piping | Ribbon pony / Chestnut | Joyful (soft motion) |
| Retro | Male · Retro burgundy | Burgundy bowling shirt, ivory vertical panels | Side part / Espresso | Gentle smile (refined) |
| Retro | Female · Retro cherry | Large cherry gingham dress, compact waist bow | Soft bob / Espresso | Gentle smile (refined) |

City ivory uses existing navy suit trousers and white shoes; City ink uses ochre shorts and white shoes. Campus sky uses navy shorts. Retro burgundy uses navy suit trousers and brown shoes, and Retro cherry uses brown shoes. Exact IDs and source-bound selections are in [looks.json](../../../artwork/kling-collection/source/city-fashion-v1/looks.json). Existing hairstyles and expressions are reused; these are six new clothes, not six new heads.

## Artwork and fitting

OpenAI image generation supplies the new clothing detail. The donor sheets' generated anatomy and footwear are discarded. [Source artwork, prompts, traces and processing](../../../artwork/kling-collection/source/city-fashion-v1/README.md) are retained separately from actual application exports. Browser composition remains local and deterministic.

The three male tops retain the exact Teal V5 ownership and alpha across 88 poses each. City ink retains the repaired Plum V1 top contract across 96 poses. The two female dresses retain Coral V9 across 96 poses each. The separate top has its own bodice sampler and can mix with existing bottoms; it does not occupy the full-body dress slot.

The polo's chest stripes were extended through bounded cloth-only sampling padding after the first fitting exposed abrupt side stops. The cherry donor's large bow was reduced in a second image-generation edit. Dress fitting reuses the reviewed waist-overlap and hem processing. No old wardrobe bank or source frame is regenerated.

## Review limits

- New details use established short-sleeve and sleeveless cuts. They do not add new garment silhouettes or cloth physics.
- The existing female V9 waist-side contour remains raised in some deep crouches. Large gingham makes compression in those poses more noticeable; the collection does not replace the approved body or skirt geometry to conceal it.
- Original motion blur and some protected neckline remnants remain. Existing trouser shading is broader than the new shirt detail.
- Outfit selection preserves hair and face. A baked CharacterPack supports independent playback; use **Save wardrobe** to retain an editable clothing project.
- Technical validation and visual review are separate. This collection is delivered for review, without assuming the user's visual acceptance.
