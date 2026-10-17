// Offline asset preparation only. Runtime uses the committed lossless layer bank.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("prepare-illustrated-assets.py", import.meta.url),
);
const result = spawnSync("python3", [script], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
