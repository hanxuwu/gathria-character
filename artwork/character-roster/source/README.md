# Ravi, Lina and Nora source illustrations

Five OpenAI image-generation calls on 2026-10-18 produced these original
transparent source PNGs. Exact prompts, input references, dimensions and hashes
are retained beside them in `generation-record.json`. No model is called by
the running application.

- `roster-design.png`: three complete everyday character designs. The existing
  Theo and Willow source illustrations guide the warm chibi proportions and
  drawing finish. This is a design reference, not an animation export.
- `expressions.png`: Ravi (short curls), Lina (rounded bob) and Nora (low
  ponytail), each with neutral, gentle and joyful complete heads.
- `ravi-top.png`: teal utility jacket torso, relaxed arms and running forearms.
- `lina-top.png`: ochre pullover torso, relaxed arms and running forearms.
- `ravi-expressions-revision.png`: candidate complete-head revision intended to
  reduce expression-dependent skin-color drift. It was **not selected**: the
  neutral/gentle median skin-luma gap only reduced from about 19.1 to 16.0, and
  native eye/outline clarity worsened slightly. The original row remains the
  selected artwork, with its expression tone variation explicitly documented.
  Generated output alone does not establish that a requested correction worked.

Registration measures each source neck and joint rather than assuming the
generator obeyed exact coordinates. Original source pixels remain here; binary
alpha conversion, semantic ownership masks, rear-hair separation and joint
overlap belong to the separately documented preparation stage. The source
glow/partial alpha is not retained in exported sprites.

The finished examples intentionally reuse existing long trousers, shorts and
footwear to test portable composition. Nora’s skirt remains a rejected fit
trial; her final playable outfit uses coral shorts. Thus the full design board is
not a claim that each final clothing pixel will match the concept drawing.
Actual assembled characters, GIFs and independent CharacterPacks are recorded
under `docs/character-roster/` after application export.
