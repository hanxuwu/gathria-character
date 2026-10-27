import { runConfiguredCollectionCapture } from "./collection-capture-runner.mjs";

await runConfiguredCollectionCapture({
  engine: "scripts/capture-kling-warm-date-collection.mjs",
  engineSha256:
    "71aa9db4f7dc04b81d06c11f20bff364a2d30afd0b6fb4096093c3bc349ccc10",
  replacements: [
    { from: "warm-date", to: "city-fashion", count: 6 },
    { from: 'default: "5230"', to: 'default: "5240"', count: 1 },
    {
      from: 'await appearance(page, "Face", look.face);',
      to: 'await appearance(page, "Face", look.face ?? "");',
      count: 1,
    },
    {
      from: "      value,\n    );\n  report.mixes.push",
      to: '      value ?? "",\n    );\n  report.mixes.push',
      count: 1,
    },
    {
      from: '    const alternate =\n      look.character === "male"',
      to: '    const alternate =\n      look.id === "city-ink" ? "navy-shorts" :\n      look.character === "male"',
      count: 1,
    },
    {
      from: '  const slot = look.character === "male" ? "bottom" : "shoes";',
      to: '  const slot = look.character === "male" || look.id === "city-ink" ? "bottom" : "shoes";',
      count: 1,
    },
    {
      from: '  const label = look.character === "male" ? "Bottom" : "Shoes";',
      to: '  const label = look.character === "male" || look.id === "city-ink" ? "Bottom" : "Shoes";',
      count: 1,
    },
    {
      from: '  const to =\n    look.character === "male"',
      to: '  const to =\n    look.id === "city-ink" ? "navy-shorts" :\n    look.character === "male"',
      count: 1,
    },
  ],
});
