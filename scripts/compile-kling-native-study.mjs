import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const directory = new URL("artwork/kling-native-study/prepared/", root);
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const api = await server.ssrLoadModule("/src/skeletal/native-study.ts");
  const png = await server.ssrLoadModule("/src/core/baked-source.ts");
  const document = JSON.parse(
    await readFile(new URL("registration.json", directory), "utf8"),
  );
  const files = Object.fromEntries(
    await Promise.all(
      ["reference.png", ...document.parts.map((p) => p.file)].map(
        async (file) => [
          file,
          new Uint8Array(await readFile(new URL(file, directory))),
        ],
      ),
    ),
  );
  const bytes = await api.createNativeStudyArchive(document, files);
  await writeFile(new URL("project.zip", directory), bytes);
  const project = await api.importNativeStudyArchive(bytes);
  const renderer = api.prepareNativeStudy(project);
  const poses = [];
  for (const pose of document.poses) {
    const pixels = renderer.render(pose.id, "right");
    const encoded = png.encodeSourceRgbaPng({
      pixels,
      width: document.frame.width,
      height: document.frame.height,
      colorChunks: project.reference.colorChunks,
    });
    await writeFile(new URL(`${pose.id}.png`, directory), encoded);
    poses.push({
      id: pose.id,
      sha256: createHash("sha256").update(pixels).digest("hex"),
    });
  }
  console.log(
    JSON.stringify(
      {
        projectSha256: createHash("sha256").update(bytes).digest("hex"),
        poses,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
