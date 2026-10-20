/** Compile registered pixels into the existing project format and explicit poses. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url),
  out = new URL("artwork/reference-mother/prepared/", root);
const registration = JSON.parse(
  await readFile(new URL("layer-registration.json", out), "utf8"),
);
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const result = await page.evaluate(async (registration) => {
    const { importProject, exportProject, encodeAttachmentPng } = await import(
      "/src/skeletal/skin-io.ts"
    );
    const { createRestStaticPose, staticPoseBodyMatrix, mapStaticPosePoint } =
      await import("/src/skeletal/static-pose.ts");
    const { prepareRig } = await import("/src/skeletal/renderer.ts");
    const { createRigDefinition } = await import("/src/skeletal/definition.ts");
    const { REQUIRED_SLOTS } = await import("/src/skeletal/types.ts");
    const { parseMotherPoseStudy, createStudyHoldPack } = await import(
      "/src/skeletal/mother-study.ts"
    );
    const base = await importProject(
      await (
        await fetch("/artwork/base-character/prepared/base-character.rig.zip")
      ).blob(),
    );
    const b64 = (bytes) => {
      let s = "";
      for (let n = 0; n < bytes.length; n += 8192)
        s += String.fromCharCode(...bytes.subarray(n, n + 8192));
      return btoa(s);
    };
    const images = {};
    for (const slot of REQUIRED_SLOTS) {
      const bitmap = await createImageBitmap(
        await (
          await fetch(
            "/artwork/reference-mother/prepared/slots/" + slot + ".png",
          )
        ).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      images[slot] = ctx.getImageData(0, 0, 192, 256).data;
      bitmap.close();
    }
    const rig = createRigDefinition();
    rig.chains = registration.chains;
    rig.pivot = registration.pivot;
    const root = rig.bones.find((b) => b.id === "root"),
      torso = rig.bones.find((b) => b.id === "torso"),
      head = rig.bones.find((b) => b.id === "head");
    root.to = rig.pivot;
    torso.from = rig.pivot;
    torso.to = registration.neck;
    head.from = registration.neck;
    head.to = [101, 65];
    for (const [name, joints] of Object.entries(rig.chains)) {
      const upper = rig.bones.find((b) => b.id === name + ":upper"),
        lower = rig.bones.find((b) => b.id === name + ":lower");
      upper.from = joints[0];
      upper.to = joints[1];
      lower.from = joints[1];
      lower.to = joints[2];
    }
    const project = {
      format: "gathria-rig-authoring",
      version: 1,
      rig,
      motions: base.motions,
      preview: { animation: "idle", facing: "right", expression: "neutral" },
      skin: {
        metadata: {
          format: "gathria-skin-pack",
          version: 1,
          id: "reference-mother-candidate-1",
          name: "Reference mother candidate 1",
          rigId: rig.id,
          bindings: {
            chains: rig.chains,
            offsets: {},
            mesh: { blendRadius: 5, volume: 0.55, preserveAnkleOverlap: true },
            jaw: { center: [101, 65], start: 110, scale: 1, length: 1 },
            hairSway: 0,
            garmentSway: 0,
          },
          sourceAppearance: {
            ...base.skin.metadata.sourceAppearance,
            name: "Reference mother candidate 1",
          },
          provenance:
            "Reference mother candidate 1. User-supplied Kling video standing frame 348 at 14.50 seconds; user PNG viewed in conversation only. Full master and supplemental hidden joint paint generated with OpenAI image generation at development time. Prompts and originals retained in artwork/reference-mother/source. Master SHA256 " +
            registration.sourceHashes["master.png"] +
            ". Offline masks and uniform registration in scripts/prepare-reference-mother.py. Visible master pixels retained; supplementary hidden areas are newly painted, not original extracted layers. Only neutral face authored; required expression slots alias neutral. Explicit four-pose study is authoritative; project container generic motion clips are not reviewed animation cycles. No runtime API.",
          slots: [...REQUIRED_SLOTS],
        },
        images,
      },
    };
    project.motions.id = "reference-mother-unreviewed-container-clips";
    const standing = createRestStaticPose(
      rig,
      project.skin.metadata,
      "standing",
    );
    function pose(id, rot, dy, angles) {
      const p = structuredClone(standing);
      p.id = id;
      p.body = { translation: [0, dy], rotation: rot };
      const matrix = staticPoseBodyMatrix(p, rig.pivot);
      for (const [name, rest] of Object.entries(rig.chains)) {
        const start = mapStaticPosePoint(matrix, rest[0]);
        let previous = start;
        const triple = [start];
        for (let i = 0; i < 2; i++) {
          const len = Math.hypot(
            rest[i + 1][0] - rest[i][0],
            rest[i + 1][1] - rest[i][1],
          );
          const a =
            angles[name]?.[i] ??
            Math.atan2(
              rest[i + 1][1] - rest[i][1],
              rest[i + 1][0] - rest[i][0],
            ) + rot;
          previous = [
            previous[0] + Math.cos(a) * len,
            previous[1] + Math.sin(a) * len,
          ];
          triple.push(previous);
        }
        p.chains[name] = triple;
      }
      return p;
    }
    // Absolute segment directions; lengths and body attachment are validated.
    const walk = pose("walk-contact", 0.025, 2, {
      nearArm: [1.95, 1.45],
      farArm: [1.05, 0.75],
      nearLeg: [0.82, 1.2],
      farLeg: [2.25, 2.0],
    });
    const flight = pose("run-flight", 0.1, -11, {
      nearArm: [2.08, 0.35],
      farArm: [0.72, -0.3],
      nearLeg: [0.65, 1.55],
      farLeg: [2.18, 3.03],
    });
    const celebrate = pose("celebrate", 0, 0, {
      nearArm: [-2.52, -1.96],
      farArm: [-0.6, -1.05],
    });
    const study = parseMotherPoseStudy(
      {
        format: "gathria-pose-study",
        version: 1,
        name: "Reference mother candidate 1",
        poses: [
          { label: "Standing", pose: standing },
          { label: "Walk contact", pose: walk },
          { label: "Run flight", pose: flight },
          { label: "Celebrate", pose: celebrate },
        ],
      },
      project,
    );
    const outputs = {};
    outputs["project.rig.zip"] = b64(
      new Uint8Array(await (await exportProject(project)).arrayBuffer()),
    );
    const prepared = prepareRig(rig, project.skin, project.motions),
      inspection = [];
    for (const { pose } of study.poses) {
      const pixels = prepared.pose(pose, "neutral");
      outputs["poses/" + pose.id + ".png"] = b64(
        await encodeAttachmentPng(pixels),
      );
      inspection.push({
        id: pose.id,
        ...prepared.inspectPose(pose, "neutral"),
      });
    }
    outputs["static-holds.character.zip"] = b64(
      new Uint8Array(
        await (await createStudyHoldPack(project, study)).arrayBuffer(),
      ),
    );
    return { outputs, study, inspection, rig, skin: project.skin.metadata };
  }, registration);
  for (const [name, b64] of Object.entries(result.outputs)) {
    const path = new URL(name, out);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, Buffer.from(b64, "base64"));
  }
  for (const [name, value] of Object.entries({
    "poses.json": result.study,
    "pose-inspection.json": result.inspection,
    "rig.json": result.rig,
    "skin.json": result.skin,
  }))
    await writeFile(new URL(name, out), JSON.stringify(value, null, 2) + "\n");
  console.log(
    "Compiled project + 4 explicit poses + static-hold CharacterPack",
  );
} finally {
  await browser.close();
  await server.close();
}
