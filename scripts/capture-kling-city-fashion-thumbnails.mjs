import { runConfiguredCollectionCapture } from "./collection-capture-runner.mjs";

await runConfiguredCollectionCapture({
  engine: "scripts/capture-kling-warm-date-thumbnails.mjs",
  engineSha256:
    "229b17aeffa6aadf4a6be095d6673fbc2df84a25617191103a399cf3b5b0742c",
  replacements: [
    { from: "warm-date", to: "city-fashion", count: 3 },
    { from: 'default: "5231"', to: 'default: "5241"', count: 1 },
    {
      from: "retainedPreviewRows: 41",
      to: "retainedPreviewRows: 47",
      count: 1,
    },
    { from: "retainedPngFiles: 82", to: "retainedPngFiles: 94", count: 1 },
    {
      from: '  41,\n  "Expected the 41 retained preview rows."',
      to: '  47,\n  "Expected the 47 retained preview rows."',
      count: 1,
    },
    {
      from: "Object.keys(preserved).length, 82",
      to: "Object.keys(preserved).length, 94",
      count: 1,
    },
    {
      from: 'await mkdir(join(evidence, "native"), { recursive: true });',
      to: 'await mkdir(join(evidence, "native"), { recursive: true });\nawait writeFile(join(evidence, "capture-script.mjs"), await readFile(fileURLToPath(import.meta.url)), { flag: "wx" });\nreport.scriptSnapshot = rel(join(evidence, "capture-script.mjs"));',
      count: 1,
    },
  ],
});
