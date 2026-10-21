// Current Kling-only delivery: real workspace, exports, native editing and playback.
// Never overwrite the historical playback / skeleton evidence folders.
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const baseline = "158efad0ced33390b2f394850436f94b24b408ee";
const phase = process.env.KLING_FOCUS_PHASE || "kling-focus";
assert(/^[a-z0-9-]+$/.test(phase));
const output = new URL(`docs/${phase}/`, root);
const workspacePath = `docs/${phase}/workspace/`;
const nativePhase = `iterations/${phase}`;
const nativePath = `docs/kling-native-study/${nativePhase}/`;
await mkdir(output, { recursive: true });
assert(
  !existsSync(new URL("browser-evidence.json", output)),
  "Preserve an earlier delivery; choose KLING_FOCUS_PHASE.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {
  scope:
    "Kling-only cleanup verification; no character art or motion changes claimed.",
  baseline,
  startedAt: new Date().toISOString(),
  workspaceReport: `${workspacePath}evidence-index.json`,
  nativeReport: `${nativePath}evidence-index.json`,
  protectedAssets: [],
};
const entries = execFileSync(
  "git",
  [
    "ls-tree",
    "-r",
    baseline,
    "--",
    "artwork/kling-playback",
    "artwork/kling-jump",
    "artwork/kling-native-study",
    "docs/kling-jump/exports",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
)
  .trim()
  .split("\n");
const oldMalePath = "artwork/reference-mother/source/reference-video.mp4";
const malePath = "artwork/kling-playback/source/male.mp4";
const maleSha256 =
  "ca1737b97dfc1bc91a1f24636a42bc6919f0a2f002975bf907cb49486779cc5a";
const relocatedRecipes = new Set([
  "artwork/kling-playback/source/selection.json",
  "artwork/kling-jump/source/selection.json",
]);
const relocationDocs = new Set([
  "artwork/kling-playback/README.md",
  "artwork/kling-jump/README.md",
]);
async function verifyAssets() {
  const result = [];
  for (const entry of entries) {
    const [header, file] = entry.split("\t");
    const [, , originalBlob] = header.split(" ");
    const actualBlob = execFileSync("git", ["hash-object", "--", file], {
      cwd: fileURLToPath(root),
      encoding: "utf8",
    }).trim();
    const bytes = await readFile(new URL(file, root));
    let permittedChange;
    if (relocatedRecipes.has(file)) {
      const before = JSON.parse(
        execFileSync("git", ["show", `${baseline}:${file}`], {
          cwd: fileURLToPath(root),
          encoding: "utf8",
        }),
      );
      const after = JSON.parse(bytes);
      assert.equal(before.characters.male.video, oldMalePath);
      assert.equal(after.characters.male.video, malePath);
      assert.equal(after.characters.male.sha256, maleSha256);
      before.characters.male.video = malePath;
      assert.deepEqual(
        after,
        before,
        `Recipe changed beyond relocated male path: ${file}`,
      );
      permittedChange =
        "Only characters.male.video relocates the exact existing original; every other parsed recipe value is unchanged.";
    } else if (relocationDocs.has(file)) {
      assert(
        bytes
          .toString()
          .includes(file.includes("kling-jump") ? malePath : "source/male.mp4"),
      );
      assert(!bytes.toString().includes(oldMalePath));
      permittedChange =
        "Source README documents the original male video relocation; not a runtime or artwork asset.";
    } else {
      assert.equal(
        actualBlob,
        originalBlob,
        `Approved source/export changed: ${file}`,
      );
    }
    result.push({
      file,
      gitBlob: actualBlob,
      sha256: sha(bytes),
      unchangedFromBaseline: actualBlob === originalBlob,
      ...(permittedChange ? { permittedChange } : {}),
    });
  }
  const maleBytes = await readFile(new URL(malePath, root));
  assert.equal(sha(maleBytes), maleSha256);
  const oldMaleBlob = execFileSync(
    "git",
    ["rev-parse", `${baseline}:${oldMalePath}`],
    { cwd: fileURLToPath(root), encoding: "utf8" },
  ).trim();
  const maleBlob = execFileSync("git", ["hash-object", "--", malePath], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  }).trim();
  assert.equal(maleBlob, oldMaleBlob);
  result.push({
    file: malePath,
    relocatedFrom: oldMalePath,
    gitBlob: maleBlob,
    sha256: maleSha256,
    unchangedFromBaseline: true,
    bytes: maleBytes.length,
  });
  return result;
}

async function run(script, env) {
  console.log(new Date().toISOString(), `Running ${script}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: fileURLToPath(root),
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(Error(`${script} exceeded ten minutes`));
    }, 600000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(Error(`${script} exited ${code}`));
    });
  });
}
try {
  report.protectedAssets = await verifyAssets();
  await run("scripts/verify-kling-workspace.mjs", {
    KLING_WORKSPACE_OUTPUT: workspacePath,
  });
  await run("scripts/verify-kling-native-study.mjs", {
    EVIDENCE_PHASE: nativePhase,
  });
  execFileSync("python", ["scripts/render-kling-native-study-review.py"], {
    cwd: fileURLToPath(root),
    env: { ...process.env, EVIDENCE_PHASE: nativePhase },
    stdio: "inherit",
  });
  const workspace = JSON.parse(
    await readFile(new URL(`${workspacePath}evidence-index.json`, root)),
  );
  const native = JSON.parse(
    await readFile(new URL(`${nativePath}evidence-index.json`, root)),
  );
  assert(workspace.passed && native.passed && native.inputsUnchanged);
  assert(workspace.clearMaleSkeletonEntry.femaleUnavailableExplicit);
  assert(
    workspace.characters.every(
      (character) => character.exactZipBytes && character.cases.length === 10,
    ),
  );
  assert.equal(native.editorPoses.length, 8);
  assert.equal(native.independentPlayback.length, 8);
  assert(native.editorClosedBeforeIndependentPlayer);
  assert(native.projectSaveReopen.editedProjectReopensExactly);
  report.workspace = {
    passed: true,
    characters: workspace.characters.map((character) => ({
      id: character.id,
      cases: character.cases.length,
      exactExportSha256: character.exportSha256,
      jumpHoldsAndReplays: character.heldJumpAndReplay,
    })),
    clearMaleSkeletonEntry: workspace.clearMaleSkeletonEntry,
    sessionsPreserved: workspace.tabSessionsPreserved,
    forbiddenRequests: workspace.forbiddenRequests,
  };
  report.native = {
    passed: true,
    editorCases: native.editorPoses.length,
    independentCases: native.independentPlayback.length,
    closedEditor: native.editorClosedBeforeIndependentPlayer,
    projectSaveReopen: native.projectSaveReopen,
    pixelChecks: native.rawPixelChecks,
  };
  report.nativeArtifactValidation = `${nativePath}artifact-validation.json`;
  // Decode all new workspace screenshots and each actual exported project PNG.
  report.workspaceArtifacts = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
import io,json,zipfile
from pathlib import Path
from PIL import Image
base=Path(${JSON.stringify(workspacePath)})
result={'pngs':[],'zips':[]}
for p in sorted(base.rglob('*.png')):
 with Image.open(p) as image:
  image.load();result['pngs'].append({'file':str(p),'size':list(image.size),'decoded':True})
for p in sorted(base.rglob('*.zip')):
 with zipfile.ZipFile(p) as archive:
  assert archive.testzip() is None
  pngs=[]
  for name in archive.namelist():
   if name.endswith('.png'):
    with Image.open(io.BytesIO(archive.read(name))) as image:
     image.load();pngs.append({'file':name,'size':list(image.size)})
  result['zips'].append({'file':str(p),'members':len(archive.namelist()),'crcPassed':True,'decodedPngs':pngs})
print(json.dumps(result))
`,
      ],
      { cwd: fileURLToPath(root), encoding: "utf8" },
    ),
  );
  assert.deepEqual(await verifyAssets(), report.protectedAssets);
  report.protectedAssetsUnchangedAfter = true;
  report.passed = true;
  console.log(new Date().toISOString(), "Kling-only browser evidence passed");
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    new URL("browser-evidence.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
}
