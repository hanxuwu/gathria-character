// Native male painted-cut inputs; the shared engine verifies every supported mixed pose.
import { buildDualTailored } from "./lib/build-dual-tailored.mjs";
const specifications = [
  {
    view: "original",
    sourceUrl: "/docs/kling-motion/exports/male.character.zip",
    registrationUrl:
      "/docs/dual-tailored/assets/male/male-ankle-reviewed-v1.registration.json",
    seeds: [
      {
        slot: "top",
        logicalId: "daily-shirt",
        url: "/docs/dual-tailored/assets/male/original-top.garment.zip",
        sourceRgb: [73, 123, 132],
      },
      {
        slot: "bottom",
        logicalId: "daily-trousers",
        url: "/docs/dual-tailored/assets/male/original-bottom.garment.zip",
        sourceRgb: [218, 157, 95],
      },
    ],
  },
  {
    view: "side",
    sourceUrl: "/docs/kling-side-workspace/assets/male.source.zip",
    registrationUrl:
      "/artwork/kling-side-expansion/templates/male.registration.json",
    seeds: [
      {
        slot: "top",
        logicalId: "daily-shirt",
        url: "/docs/kling-side-expansion/assets/male-shirt.garment.zip",
        sourceRgb: [220, 125, 94],
      },
      {
        slot: "bottom",
        logicalId: "daily-trousers",
        url: "/docs/kling-side-expansion/assets/male-trousers.garment.zip",
        sourceRgb: [206, 182, 154],
      },
    ],
  },
];
await buildDualTailored({
  character: "male",
  specifications,
  port: 5188,
  check: process.argv.includes("--check"),
});
