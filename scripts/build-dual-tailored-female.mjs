// Original-view cloth donors are prepared by build-dual-tailored-female.py.
// This stage preserves their fitted cut while building source-bound palettes.
import { buildDualTailored } from "./lib/build-dual-tailored.mjs";

await buildDualTailored({
  character: "female",
  port: 5190,
  check: process.argv.includes("--check"),
  includeCotton: false,
  newDrawing: true,
  paintedCutOrigins: {
    original:
      "New recorded eight-pose blouse/skirt cloth artwork, fitted offline to unchanged source poses",
    side: "Existing independently painted and reviewed side-view blouse/skirt",
  },
  specifications: [
    {
      view: "original",
      sourceUrl: "/docs/kling-motion/exports/female.character.zip",
      registrationUrl:
        "/docs/dual-tailored/assets/female/original-tailored-v1.registration.json",
      seeds: [
        {
          slot: "top",
          logicalId: "daily-blouse",
          label: "圆领短袖上衣",
          url: "/docs/dual-tailored/assets/female/original-top.garment.zip",
          sourceRgb: [241, 225, 202],
        },
        {
          slot: "bottom",
          logicalId: "daily-skirt",
          label: "褶裥短裙",
          url: "/docs/dual-tailored/assets/female/original-bottom.garment.zip",
          sourceRgb: [201, 130, 137],
        },
      ],
    },
    {
      view: "side",
      sourceUrl: "/docs/kling-side-workspace/assets/female.source.zip",
      registrationUrl:
        "/artwork/kling-side-expansion/templates/female.registration.json",
      seeds: [
        {
          slot: "top",
          logicalId: "daily-blouse",
          label: "圆领短袖上衣",
          url: "/docs/kling-side-expansion/assets/female-blouse.garment.zip",
          sourceRgb: [241, 225, 202],
        },
        {
          slot: "bottom",
          logicalId: "daily-skirt",
          label: "褶裥短裙",
          url: "/docs/kling-side-expansion/assets/female-skirt.garment.zip",
          sourceRgb: [201, 130, 137],
        },
      ],
    },
  ],
});
