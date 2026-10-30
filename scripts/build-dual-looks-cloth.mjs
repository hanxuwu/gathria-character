// Keep the existing daily collection immutable; publish the two-pose skirt
// correction only in the separately named complete-look collection.
import { buildDualTailored } from "./lib/build-dual-tailored.mjs";

await buildDualTailored({
  character: "female",
  port: 5192,
  check: process.argv.includes("--check"),
  outputRoot: "docs/dual-looks-cloth/assets",
  artRoot: "artwork/dual-looks-cloth",
  collectionId: "complete-day",
  idPrefix: "dual-complete",
  includeCotton: false,
  specifications: [
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
          label: "褶裥短裙 · 局部修订",
          url: "/docs/dual-looks-cloth/assets/female-side-skirt-reviewed.garment.zip",
          sourceRgb: [201, 130, 137],
        },
      ],
    },
  ],
});
