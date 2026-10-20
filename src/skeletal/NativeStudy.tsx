import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  Bone,
  FolderOpen,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { downloadBlob } from "../core/pack";
import { MainNavigation } from "../workspace/MainNavigation";
import {
  NATIVE_CHAINS,
  createNativeStudyHoldPack,
  exportNativeStudyProject,
  importNativeStudyArchive,
  makeNativePose,
  prepareNativeStudy,
  type NativeChain,
  type NativePoseId,
  type NativeStudyDocument,
  type NativeStudyProject,
} from "./native-study";
import "./native-study.css";

const candidateUrl = new URL(
  "../../artwork/kling-native-study/prepared/project.zip",
  import.meta.url,
).href;
const embedded =
  new URLSearchParams(window.location.search).get("embedded") === "1";
const chainNames: Record<NativeChain, string> = {
  nearArm: "Near arm",
  farArm: "Far arm",
  nearLeg: "Near leg",
  farLeg: "Far leg",
};
const toDegrees = (angle: number) =>
  Math.round((Math.atan2(Math.sin(angle), Math.cos(angle)) * 180) / Math.PI);
function anglesFor(project: NativeStudyProject, poseId: NativePoseId) {
  const pose = project.document.poses.find((p) => p.id === poseId)!;
  return Object.fromEntries(
    NATIVE_CHAINS.map((chain) => {
      const a = project.document.chains[chain],
        b = pose.chains[chain];
      return [
        chain,
        [0, 1].map(
          (i) =>
            Math.atan2(b[i + 1][1] - b[i][1], b[i + 1][0] - b[i][0]) -
            Math.atan2(a[i + 1][1] - a[i][1], a[i + 1][0] - a[i][0]),
        ),
      ];
    }),
  ) as Record<NativeChain, [number, number]>;
}

function NativeCanvas({
  pixels,
  project,
  poseId,
  zoom,
  facing,
  bones,
  original = false,
}: {
  pixels: Uint8Array | Uint8ClampedArray;
  project: NativeStudyProject;
  poseId: NativePoseId;
  zoom: number;
  facing: "left" | "right";
  bones: boolean;
  original?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { width, height } = project.document.frame;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    let data = new Uint8ClampedArray(pixels);
    // Reference remains the exact source image; left view is a display mirror.
    if (original && facing === "left") {
      const mirrored = new Uint8ClampedArray(data.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          mirrored.set(
            data.subarray(offset, offset + 4),
            (y * width + width - 1 - x) * 4,
          );
        }
      data = mirrored;
    }
    ctx.putImageData(new ImageData(data, width, height), 0, 0);
    if (!bones || original) return;
    const inspection = prepareNativeStudy(project).inspect(poseId);
    const map = (point: readonly number[]) => [
      facing === "left" ? width - 1 - point[0] : point[0],
      point[1],
    ];
    const segment = (
      from: readonly number[],
      to: readonly number[],
      color: string,
    ) => {
      const a = map(from),
        b = map(to);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = "#ffffffdd";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const point of [a, b]) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    for (const bone of inspection.bodyBones)
      segment(bone.from, bone.to, "#4b7660");
    for (const [chain, points] of Object.entries(inspection.chains)) {
      const color = chain.startsWith("near") ? "#b1542e" : "#406ca6";
      segment(points[0], points[1], color);
      segment(points[1], points[2], color);
    }
  }, [pixels, project, poseId, facing, bones, original]);
  return (
    <canvas
      ref={ref}
      id={original ? "native-reference-canvas" : "native-posed-canvas"}
      data-pose={poseId}
      data-facing={facing}
      data-bones={bones && !original}
      width={project.document.frame.width}
      height={project.document.frame.height}
      style={{
        width: project.document.frame.width * zoom,
        height: project.document.frame.height * zoom,
      }}
      role="img"
      aria-label={
        original
          ? "Immutable original standing reference"
          : `${poseId} native skeletal render`
      }
    />
  );
}

export function NativeStudy() {
  const [project, setProject] = useState<NativeStudyProject | null>(null);
  const [baseline, setBaseline] = useState<NativeStudyDocument | null>(null);
  const [history, setHistory] = useState<NativeStudyDocument[]>([]);
  const [poseId, setPoseId] = useState<NativePoseId>("standing");
  const [zoom, setZoom] = useState(0.5);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [bones, setBones] = useState(false);
  const [compare, setCompare] = useState(true);
  const [dark, setDark] = useState(false);
  const [chain, setChain] = useState<NativeChain>("nearArm");
  const [upper, setUpper] = useState(0);
  const [lower, setLower] = useState(0);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("Loading native candidate…");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  function accept(next: NativeStudyProject) {
    setProject(next);
    setBaseline(structuredClone(next.document));
    setHistory([]);
    setPoseId("standing");
    setStatus(
      `Loaded: ${next.document.name}. Four static poses; native artwork retained.`,
    );
  }
  async function openBuiltIn(signal?: AbortSignal) {
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(candidateUrl, { signal });
      if (!response.ok)
        throw Error(`Candidate download failed (${response.status}).`);
      const next = await importNativeStudyArchive(
        new Uint8Array(await response.arrayBuffer()),
      );
      if (token === request.current && !signal?.aborted) accept(next);
    } catch (failure) {
      if (token === request.current && !signal?.aborted)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (token === request.current && !signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void openBuiltIn(controller.signal);
    return () => {
      controller.abort();
      request.current++;
    };
  }, []);

  const prepared = useMemo(
    () => (project ? prepareNativeStudy(project) : null),
    [project],
  );
  const pixels = useMemo(
    () => prepared?.render(poseId, facing),
    [prepared, poseId, facing],
  );
  const activePose = project?.document.poses.find((p) => p.id === poseId);
  useEffect(() => {
    if (!project) return;
    const angles = anglesFor(project, poseId)[chain];
    setUpper(toDegrees(angles[0]));
    setLower(toDegrees(angles[1]));
  }, [project, poseId, chain]);

  async function action(label: string, run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
      setStatus(label);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  function replaceDocument(document: NativeStudyDocument) {
    if (!project) return;
    try {
      const next = { ...project, document };
      prepareNativeStudy(next);
      setHistory((previous) => [...previous.slice(-19), project.document]);
      setProject(next);
      setError("");
      setStatus(
        "Pose updated. Save the native project to keep these joint coordinates.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  function applyAngles() {
    if (!project || !activePose || poseId === "standing") return;
    try {
      const angles = anglesFor(project, poseId);
      angles[chain] = [(upper * Math.PI) / 180, (lower * Math.PI) / 180];
      const pose = makeNativePose(project.document, poseId, activePose.label, {
        body: activePose.body,
        angles,
      });
      replaceDocument({
        ...project.document,
        poses: project.document.poses.map((p) => (p.id === poseId ? pose : p)),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <>
      {!embedded && <MainNavigation active="workbench" />}
      <main
        className={`native-study${embedded ? " native-study--embedded" : ""}`}
      >
        <header className="native-study-heading">
          <div>
            <p className="native-study-eyebrow">
              Native skeletal candidate · review study
            </p>
            <h1>Kling male, built from the original.</h1>
            <p>
              One fixed standing reference. Registered parts. Four skeletal
              stills.
            </p>
          </div>
          <span className="native-study-badge">
            704 × 1056 <span>Smooth alpha · original scale</span>
          </span>
        </header>
        <p className="native-study-notice">
          This candidate keeps the original standing appearance and tests new
          joint poses. Hidden surfaces are reconstructed. Clothing and
          expression are fixed; complete animation cycles are a later step.
        </p>
        <div className="native-study-toolbar">
          <label>
            Review pose
            <select
              aria-label="Review pose"
              value={poseId}
              disabled={!project || busy}
              onChange={(event) =>
                setPoseId(event.target.value as NativePoseId)
              }
            >
              {(
                project?.document.poses ?? [
                  { id: "standing", label: "Standing" },
                ]
              ).map((pose) => (
                <option key={pose.id} value={pose.id}>
                  {pose.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction
            <select
              aria-label="Direction"
              value={facing}
              onChange={(event) =>
                setFacing(event.target.value as "left" | "right")
              }
            >
              <option value="right">Right · native</option>
              <option value="left">Left · mirrored</option>
            </select>
          </label>
          <label>
            Display zoom
            <select
              aria-label="Display zoom"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              <option value="0.5">½× · fit</option>
              <option value="1">1× · native</option>
              <option value="2">2× · inspect</option>
            </select>
          </label>
          <label className="native-study-toggle">
            <input
              type="checkbox"
              checked={bones}
              onChange={(event) => setBones(event.target.checked)}
            />{" "}
            Bones
          </label>
          <label className="native-study-toggle">
            <input
              type="checkbox"
              checked={compare}
              onChange={(event) => setCompare(event.target.checked)}
            />{" "}
            Show reference
          </label>
          <label className="native-study-toggle">
            <input
              type="checkbox"
              checked={dark}
              onChange={(event) => setDark(event.target.checked)}
            />{" "}
            Dark background
          </label>
        </div>
        <p className="native-study-status" role="status">
          {busy ? "Working… " : ""}
          {status}
        </p>
        {error && (
          <div className="native-study-error" role="alert">
            <strong>Could not complete this action.</strong>
            <p>{error}</p>
            <button type="button" onClick={() => void openBuiltIn()}>
              Reload built-in candidate
            </button>
          </div>
        )}
        {project && pixels && (
          <>
            <section
              className={`native-study-stage${dark ? " native-study-stage--dark" : ""}`}
              aria-label="Native reference and reconstructed pose"
            >
              {compare && (
                <figure>
                  <figcaption>
                    <strong>Original reference</strong>
                    <span>Frame 348 · fixed standing pose</span>
                  </figcaption>
                  <NativeCanvas
                    original
                    pixels={project.reference.pixels}
                    project={project}
                    poseId={poseId}
                    zoom={zoom}
                    facing={facing}
                    bones={false}
                  />
                </figure>
              )}
              <figure>
                <figcaption>
                  <strong>{activePose?.label} · recomposed</strong>
                  <span>
                    {bones
                      ? "Bone overlay is for inspection only"
                      : "Actual native skeletal render"}
                  </span>
                </figcaption>
                <NativeCanvas
                  pixels={pixels}
                  project={project}
                  poseId={poseId}
                  zoom={zoom}
                  facing={facing}
                  bones={bones}
                />
              </figure>
            </section>
            <div className="native-study-bottom">
              <section
                className="native-study-card"
                aria-labelledby="pose-adjustments-heading"
              >
                <h2 id="pose-adjustments-heading">
                  <Bone size={18} aria-hidden="true" /> Inspect the joints
                </h2>
                <p>
                  Adjust a review pose without stretching its bones. Standing
                  stays locked to the source registration. Shoes follow the
                  lower leg; hands follow the forearm.
                </p>
                <fieldset disabled={busy || poseId === "standing"}>
                  <label>
                    Limb
                    <select
                      aria-label="Limb"
                      value={chain}
                      onChange={(event) =>
                        setChain(event.target.value as NativeChain)
                      }
                    >
                      {NATIVE_CHAINS.map((id) => (
                        <option key={id} value={id}>
                          {chainNames[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Upper rotation (degrees)
                    <input
                      aria-label="Upper rotation (degrees)"
                      type="number"
                      min={-180}
                      max={180}
                      step={1}
                      value={upper}
                      onChange={(event) => setUpper(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Lower rotation (degrees)
                    <input
                      aria-label="Lower rotation (degrees)"
                      type="number"
                      min={-180}
                      max={180}
                      step={1}
                      value={lower}
                      onChange={(event) => setLower(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={applyAngles}>
                    Apply joint angles
                  </button>
                </fieldset>
                <div className="native-study-actions">
                  <button
                    type="button"
                    disabled={busy || !history.length}
                    onClick={() => {
                      const previous = history.at(-1)!;
                      setProject({ ...project, document: previous });
                      setHistory(history.slice(0, -1));
                      setStatus("Last pose edit undone.");
                    }}
                  >
                    <Undo2 size={16} aria-hidden="true" /> Undo pose edit
                  </button>
                  <button
                    type="button"
                    disabled={busy || poseId === "standing" || !baseline}
                    onClick={() =>
                      replaceDocument({
                        ...project.document,
                        poses: project.document.poses.map((pose) =>
                          pose.id === poseId
                            ? structuredClone(
                                baseline!.poses.find((p) => p.id === poseId)!,
                              )
                            : pose,
                        ),
                      })
                    }
                  >
                    <RotateCcw size={16} aria-hidden="true" /> Reset this pose
                  </button>
                </div>
              </section>
              <section
                className="native-study-card"
                aria-labelledby="native-save-heading"
              >
                <h2 id="native-save-heading">Keep this candidate</h2>
                <p>
                  The project ZIP includes the source reference, all parts,
                  registration and pose coordinates. Save before leaving. PNG
                  and CharacterPack exports contain clean artwork without the
                  bone overlay or preview background.
                </p>
                <div className="native-study-actions native-study-actions--exports">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "Native project saved with its current pose coordinates.",
                        async () =>
                          downloadBlob(
                            new Blob(
                              [await exportNativeStudyProject(project)],
                              { type: "application/zip" },
                            ),
                            "kling-male-native-study.project.zip",
                          ),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} aria-hidden="true" /> Save native
                    project
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    <FolderOpen size={16} aria-hidden="true" /> Open native
                    project
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        `${activePose?.label} PNG exported at native resolution.`,
                        async () => {
                          const png = encodeSourceRgbaPng({
                            width: project.document.frame.width,
                            height: project.document.frame.height,
                            pixels: new Uint8Array(pixels),
                            colorChunks: project.reference.colorChunks,
                          });
                          downloadBlob(
                            new Blob([png], { type: "image/png" }),
                            `kling-male-${poseId}-${facing}.png`,
                          );
                        },
                      )
                    }
                  >
                    Export pose PNG
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "CharacterPack exported: four static holds, not animation cycles.",
                        async () =>
                          downloadBlob(
                            await createNativeStudyHoldPack(project),
                            "kling-male-native-static-holds.character.zip",
                          ),
                      )
                    }
                  >
                    Export static CharacterPack
                  </button>
                </div>
                <p className="native-study-fineprint">
                  The independent player can load the CharacterPack. Its idle /
                  walk / run / celebrate selectors each hold one pose; jump is
                  unavailable. Reopen the native project here to edit the
                  skeleton.
                </p>
              </section>
            </div>
          </>
        )}
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".zip,application/zip"
          aria-label="Native project ZIP"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            request.current++;
            void action(
              "Native project reopened with its saved parts and pose coordinates.",
              async () => {
                if (file.size > 64 * 1024 * 1024)
                  throw Error("Native project ZIP must be at most 64 MiB.");
                accept(
                  await importNativeStudyArchive(
                    new Uint8Array(await file.arrayBuffer()),
                  ),
                );
              },
            );
          }}
        />
      </main>
    </>
  );
}

export function mountNativeStudy() {
  createRoot(document.getElementById("root")!).render(<NativeStudy />);
}
