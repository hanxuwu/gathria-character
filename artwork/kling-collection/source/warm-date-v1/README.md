# Warm daily and refined date — source artwork

This additive collection uses the approved Kling male and female characters. New clothing drawings were made with OpenAI image generation on 2026-10-27, using the existing transparent references `artwork/kling-appearance/source/male-reference.png` and `female-reference.png`.

The design sheets are **donors**, not application renders. Their generated faces, bodies, trousers, shoes and background are not used. Each new shirt/dress is manually traced and its painted cloth sampled into the complete, reviewed source-pose garment bank. The original Kling video frames, head, hands, timing and registration remain authoritative. Hidden donor cloth is completed from neighboring cloth; it is not an accurately extracted video layer.

Male donors: cocoa cable-knit vest over ivory short sleeves, dusty-rose camp shirt with patch pocket, deep-plum tipped polo. Female donors: buttercream dress with cocoa collar/bow, apricot pocket dress with sage waistband, deep-teal dress with gold waist/hem details. Prompts and donor traces are retained beside the images.

The male garments preserve `teal-camp-shirt-v5.zip` ownership and alpha; female dresses preserve `coral-daydress-v9.zip`. These are new painted details on reviewed silhouettes. They do not introduce new sleeve cuts, new skeletons or cloth simulation. Existing trousers, shoes, hairstyles and expressions supply the coordinated looks in `looks.json`.

Processing scripts:

- `scripts/prepare-kling-warm-date-male.py`
- `scripts/prepare-kling-warm-date-female.py`
- `scripts/publish-kling-warm-date-collection.py`

The prepared audits identify hashes and preservation checks. Only exports from the actual workbench/player are used for the final collection review. See `docs/kling-collection/warm-date-v1/README.md` for captured results and remaining limitations.
