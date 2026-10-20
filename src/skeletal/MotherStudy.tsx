import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { strToU8, zipSync } from "fflate";
import { downloadBlob } from "../core/pack";
import { importProject } from "./skin-io";
import { prepareRig } from "./renderer";
import type { AuthoringProject, Facing, Point, RigInspection } from "./types";
import {
  STUDY_POSES,
  createStudyHoldPack,
  faceStudyPixels,
  parseMotherPoseStudy,
  studySheet,
  type MotherPoseStudy,
} from "./mother-study";
import projectUrl from "../../artwork/reference-mother/prepared/project.rig.zip?url";
import posesUrl from "../../artwork/reference-mother/prepared/poses.json?url";
import masterUrl from "../../artwork/reference-mother/prepared/master-hd.png?url";
import partsUrl from "../../artwork/reference-mother/prepared/parts-hd.zip?url";
import registrationUrl from "../../artwork/reference-mother/prepared/layer-registration.json?url";
import "./MotherStudy.css";

interface LoadedStudy {
  project: AuthoringProject;
  study: MotherPoseStudy;
  projectBytes: Uint8Array;
  registration: Uint8Array;
}

async function checkedFetch(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw Error(`${label} could not be loaded (${response.status}).`);
  return response;
}

async function pngBlob(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw Error("2D canvas is unavailable.");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("PNG export failed."))),
      "image/png",
    ),
  );
}

function drawBones(
  context: CanvasRenderingContext2D,
  inspection: RigInspection,
) {
  const line = (points: readonly Point[], color: string) => {
    context.beginPath();
    context.moveTo(...points[0]);
    points.slice(1).forEach((p) => context.lineTo(...p));
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2.6;
    context.stroke();
    context.strokeStyle = color;
    context.lineWidth = 1.1;
    context.stroke();
    points.forEach(([x, y]) => {
      context.beginPath();
      context.arc(x, y, 2, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 0.6;
      context.stroke();
    });
  };
  inspection.bodyBones?.forEach((b) => line([b.from, b.to], "#614cb0"));
  inspection.limbs.forEach((limb) =>
    line(limb.bones, limb.id.startsWith("near") ? "#d34a29" : "#087c95"),
  );
}

export function MotherStudy() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<LoadedStudy | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(
    "Loading the candidate and four review poses…",
  );
  const [attempt, setAttempt] = useState(0);
  const [poseIndex, setPoseIndex] = useState(0);
  const [facing, setFacing] = useState<Facing>("right");
  const [zoom, setZoom] = useState(2);
  const [bones, setBones] = useState(false);
  const [background, setBackground] = useState("neutral");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    setLoadError("");
    setNotice("Loading the candidate and four review poses…");
    void (async () => {
      const [projectResponse, posesResponse, registrationResponse] =
        await Promise.all([
          checkedFetch(projectUrl, "Candidate project"),
          checkedFetch(posesUrl, "Review poses"),
          checkedFetch(registrationUrl, "Layer registration"),
        ]);
      const projectBytes = new Uint8Array(await projectResponse.arrayBuffer());
      const project = await importProject(
        new Blob([projectBytes], { type: "application/zip" }),
      );
      const study = parseMotherPoseStudy(await posesResponse.json(), project);
      const registration = new Uint8Array(
        await registrationResponse.arrayBuffer(),
      );
      JSON.parse(new TextDecoder().decode(registration));
      // Validate and render every pose before enabling the viewer or downloads.
      const prepared = prepareRig(project.rig, project.skin, project.motions);
      study.poses.forEach(({ pose }) => prepared.pose(pose, "neutral"));
      if (!active) return;
      setLoaded({ project, study, projectBytes, registration });
      setNotice(
        "Candidate ready. Four static poses; animation cycles are not part of this study.",
      );
    })().catch((error: unknown) => {
      if (active) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "The candidate could not be loaded.",
        );
        setNotice("");
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const prepared = useMemo(
    () =>
      loaded
        ? prepareRig(
            loaded.project.rig,
            loaded.project.skin,
            loaded.project.motions,
          )
        : null,
    [loaded],
  );
  const pose = loaded?.study.poses[poseIndex]?.pose;
  const pixels = useMemo(
    () => (prepared && pose ? prepared.pose(pose, "neutral") : null),
    [prepared, pose],
  );
  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!target || !context) return;
    target.width = 192 * zoom;
    target.height = 256 * zoom;
    if (!pixels || !prepared || !pose) return;
    const source = document.createElement("canvas");
    source.width = 192;
    source.height = 256;
    source
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels), 192, 256),
        0,
        0,
      );
    context.scale(zoom, zoom);
    context.imageSmoothingEnabled = false;
    if (facing === "left") {
      context.translate(192, 0);
      context.scale(-1, 1);
    }
    context.drawImage(source, 0, 0);
    if (bones) drawBones(context, prepared.inspectPose(pose, "neutral"));
  }, [pixels, prepared, pose, facing, zoom, bones]);

  async function save(task: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await task();
      setNotice(message);
    } catch (error) {
      setNotice(
        `Export failed: ${error instanceof Error ? error.message : "Please retry."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mother-study">
      <header className="mother-header">
        <a href="/skin-studio.html">← Skin & skeleton studio</a>
        <span className="mother-tag">Independent candidate · pose study</span>
        <h1>Reference mother model</h1>
        <p>
          A reusable base character with four fixed review poses. Inspect the
          proportions, layer overlaps and joint connections before developing
          animation cycles.
        </p>
      </header>
      {loadError ? (
        <div className="mother-error" role="alert">
          <p>{loadError}</p>
          <button onClick={() => setAttempt(attempt + 1)}>
            Retry loading candidate
          </button>
        </div>
      ) : null}
      <p role="status" className="mother-status">
        {notice}
      </p>
      <div className="mother-layout">
        <section className="mother-stage" aria-label="Candidate pose preview">
          <div className={`mother-canvas-wrap mother-background-${background}`}>
            <canvas
              id="mother-study-canvas"
              ref={canvas}
              width={384}
              height={512}
              data-pose={pose?.id ?? "loading"}
              data-facing={facing}
              aria-label={`${STUDY_POSES[poseIndex].label}, facing ${facing}, ${zoom}× view`}
            />
          </div>
          <p className="mother-caption">
            {STUDY_POSES[poseIndex].label} · {facing} · {zoom}× integer zoom
            <br />
            192 × 256 native pixels · fixed frame anchor (96, 240)
          </p>
        </section>
        <aside className="mother-controls">
          <fieldset disabled={!loaded || busy}>
            <legend>Review a pose</legend>
            <div className="mother-pose-buttons">
              {STUDY_POSES.map(({ id, label }, index) => (
                <button
                  key={id}
                  aria-pressed={poseIndex === index}
                  onClick={() => setPoseIndex(index)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Facing
              <select
                aria-label="Facing"
                value={facing}
                onChange={(event) => setFacing(event.target.value as Facing)}
              >
                <option value="right">Right</option>
                <option value="left">Left · mirrored</option>
              </select>
            </label>
            <label>
              Zoom
              <select
                aria-label="Zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value="1">1× · native size</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>
            <label>
              Background
              <select
                aria-label="Background"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              >
                <option value="neutral">Neutral</option>
                <option value="checkered">Transparency checker</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="mother-checkbox">
              <input
                type="checkbox"
                checked={bones}
                onChange={(event) => setBones(event.target.checked)}
              />
              Bones
            </label>
          </fieldset>
          <section className="mother-scope">
            <h2>Four poses, one candidate</h2>
            <p>
              Standing, a walk contact pose, a run flight pose and raised-arm
              celebration. These are still poses, not completed animation
              cycles. Celebration is not a jump clip.
            </p>
            <p>
              The current Studio default and its saved configurations remain
              unchanged. This candidate keeps its own artwork, joint
              registration and pose document.
            </p>
          </section>
        </aside>
      </div>
      <section className="mother-downloads">
        <h2>Review and reuse</h2>
        <p>
          PNG downloads stay transparent at native size. The selected preview
          background, zoom and bones overlay are never baked into the artwork.
        </p>
        <div className="mother-download-grid">
          <article>
            <h3>Actual rendered poses</h3>
            <button
              disabled={!loaded || !pixels || busy}
              onClick={() =>
                void save(async () => {
                  if (!pixels || !pose) return;
                  downloadBlob(
                    await pngBlob(faceStudyPixels(pixels, facing), 192, 256),
                    `reference-mother-${pose.id}-${facing}.png`,
                  );
                }, "Transparent pose PNG exported at 192 × 256.")
              }
            >
              Download current pose PNG
            </button>
            <button
              disabled={!loaded || busy}
              onClick={() =>
                void save(async () => {
                  if (!loaded) return;
                  const sheet = studySheet(
                    loaded.project,
                    loaded.study,
                    facing,
                  );
                  downloadBlob(
                    await pngBlob(sheet.pixels, sheet.width, sheet.height),
                    `reference-mother-four-poses-${facing}.png`,
                  );
                }, "Four-pose transparent PNG exported in the selected direction.")
              }
            >
              Download four-pose PNG sheet
            </button>
          </article>
          <article>
            <h3>Editable pose study</h3>
            <p>
              Contains the registered project, all four explicit poses and layer
              metadata. Separate from the legacy project format.
            </p>
            <button
              disabled={!loaded || busy}
              onClick={() =>
                void save(async () => {
                  if (!loaded) return;
                  const bytes = zipSync(
                    {
                      "study.json": strToU8(
                        JSON.stringify(
                          {
                            format: "gathria-pose-study-archive",
                            version: 1,
                            project: "project.rig.zip",
                            poses: "poses.json",
                            registration: "layer-registration.json",
                          },
                          null,
                          2,
                        ),
                      ),
                      "project.rig.zip": loaded.projectBytes,
                      "poses.json": strToU8(
                        JSON.stringify(loaded.study, null, 2) + "\n",
                      ),
                      "layer-registration.json": loaded.registration,
                      "README.txt": strToU8(
                        "Reference mother candidate — four static review poses.\n\nThis is a pose-study archive, not a legacy authoring project ZIP. To reproduce it in source code, importProject(project.rig.zip), parseMotherPoseStudy(poses.json, project), then prepareRig(project.rig, project.skin, project.motions).pose(entry.pose, 'neutral'). mother-study.html displays the bundled candidate; it does not currently import pose-study archives. The ordinary Skin Studio can edit the embedded project but its ordinary motion clips are not these four review poses. No completed animation cycles are supplied. HD source parts are a separate download.\n",
                      ),
                    },
                    { level: 6 },
                  );
                  downloadBlob(
                    new Blob([bytes], { type: "application/zip" }),
                    "reference-mother.pose-study.zip",
                  );
                }, "Editable pose-study archive saved with all four poses and registration metadata.")
              }
            >
              Download pose-study archive
            </button>
            <a
              href={registrationUrl}
              download="reference-mother-layer-registration.json"
            >
              Joint & layer registration JSON
            </a>
          </article>
          <article>
            <h3>Independent playback check</h3>
            <p>
              Three one-frame holds: idle → standing, walk → contact, run →
              flight. No animation cycles or celebration/jump alias.
            </p>
            <button
              disabled={!loaded || busy}
              onClick={() =>
                void save(async () => {
                  if (!loaded) return;
                  downloadBlob(
                    await createStudyHoldPack(loaded.project, loaded.study),
                    "reference-mother-static-holds.character.zip",
                  );
                }, "Compatible CharacterPack exported: three static holds, no animation cycles.")
              }
            >
              Download static-hold CharacterPack
            </button>
            <a href="/player.html" target="_blank" rel="noreferrer">
              Open independent player ↗
            </a>
          </article>
          <article>
            <h3>High-resolution source</h3>
            <p>
              The complete transparent master and separate body parts are
              retained apart from the 192 × 256 runtime attachments.
            </p>
            <a href={masterUrl} download="reference-mother-master-hd.png">
              Download HD transparent master
            </a>
            <a href={partsUrl} download="reference-mother-parts-hd.zip">
              Download HD body parts ZIP
            </a>
          </article>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<MotherStudy />);
