import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadBlob } from "../../core/pack";
import type {
  AnimationName,
  Facing,
  GeneratedCharacter,
} from "../../core/types";
import { baselineCharacter, bakeRigProject, createRigPack } from "./bake";
import {
  createDefaultProject,
  parseRigProject,
  type RigProject,
} from "./project";
import { prepareSkeletalRig } from "./rig";
import "./lab.css";

type Inspection = ReturnType<ReturnType<typeof prepareSkeletalRig>["inspect"]>;
type Notice = { text: string; error?: boolean };

function framePixels(
  character: GeneratedCharacter,
  animation: AnimationName,
  index: number,
): Uint8ClampedArray {
  const sequence = character.manifest.animations[animation]!;
  const id = sequence.frames[index % sequence.frames.length];
  const frame = character.manifest.frames.find((item) => item.id === id)!;
  const pixels = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const start = ((frame.y + y) * character.width + frame.x) * 4;
    pixels.set(
      character.pixels.subarray(start, start + frame.width * 4),
      y * frame.width * 4,
    );
  }
  return pixels;
}

function Preview({
  character,
  animation,
  frame,
  facing,
  zoom,
  inspection,
  bones,
  mesh,
  id,
  label,
}: {
  character: GeneratedCharacter;
  animation: AnimationName;
  frame: number;
  facing: Facing;
  zoom: number;
  inspection?: Inspection;
  bones: boolean;
  mesh: boolean;
  id: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const source = document.createElement("canvas");
    source.width = 192;
    source.height = 256;
    source
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(framePixels(character, animation, frame)),
          192,
          256,
        ),
        0,
        0,
      );
    context.resetTransform();
    context.clearRect(0, 0, 192 * zoom, 256 * zoom);
    context.imageSmoothingEnabled = false;
    context.scale(zoom, zoom);
    if (facing === "left") {
      context.translate(192, 0);
      context.scale(-1, 1);
    }
    context.drawImage(source, 0, 0);
    if (inspection) {
      for (const limb of inspection.limbs) {
        const color = limb.id.toLowerCase().includes("far")
          ? "#26a9ce"
          : "#f39b24";
        if (mesh) {
          context.strokeStyle = color;
          context.lineWidth = 0.6;
          context.globalAlpha = 0.65;
          context.beginPath();
          for (let t = 0; t < limb.triangles.length; t += 3) {
            const a = limb.vertices[limb.triangles[t]];
            const b = limb.vertices[limb.triangles[t + 1]];
            const c = limb.vertices[limb.triangles[t + 2]];
            context.moveTo(a[0], a[1]);
            context.lineTo(b[0], b[1]);
            context.lineTo(c[0], c[1]);
            context.closePath();
          }
          context.stroke();
          context.globalAlpha = 1;
        }
        if (bones) {
          context.strokeStyle = "#243d39";
          context.lineWidth = 3;
          context.beginPath();
          limb.bones.forEach((point, index) => {
            if (index) context.lineTo(point[0], point[1]);
            else context.moveTo(point[0], point[1]);
          });
          context.stroke();
          context.strokeStyle = color;
          context.lineWidth = 1.5;
          context.stroke();
          for (const point of limb.bones) {
            context.beginPath();
            context.arc(point[0], point[1], 2, 0, Math.PI * 2);
            context.fillStyle = "#fffef9";
            context.fill();
            context.lineWidth = 1;
            context.stroke();
          }
        }
      }
    }
    context.resetTransform();
  }, [character, animation, frame, facing, zoom, inspection, bones, mesh]);
  return (
    <div
      className="canvas-surface"
      style={{ width: 192 * zoom, height: 256 * zoom }}
    >
      <canvas
        ref={ref}
        id={id}
        width={192 * zoom}
        height={256 * zoom}
        role="img"
        aria-label={label}
        data-frame={frame}
        data-animation={animation}
        data-facing={facing}
      />
    </div>
  );
}

function RigLab() {
  const [project, setProject] = useState<RigProject>(createDefaultProject);
  const [animation, setAnimation] = useState<AnimationName>("run");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [facing, setFacing] = useState<Facing>("right");
  const [zoom, setZoom] = useState(1);
  const [bones, setBones] = useState(false);
  const [mesh, setMesh] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const baseline = useMemo(() => baselineCharacter(), []);
  const candidate = useMemo(() => bakeRigProject(project), [project]);
  const rig = useMemo(() => prepareSkeletalRig(project), [project]);
  const inspection = useMemo(
    () =>
      animation === "run" && (bones || mesh) ? rig.inspect(frame) : undefined,
    [rig, animation, frame, bones, mesh],
  );
  const sequence = candidate.manifest.animations[animation]!;
  const frameCount = sequence.frames.length;
  const keyframe = project.timeline.frames[frame];

  useEffect(() => {
    if (!playing) return;
    let request = 0;
    const start = performance.now();
    const initialFrame = frame;
    const tick = (now: number) => {
      setFrame(
        (initialFrame + Math.floor(((now - start) * sequence.fps) / 1000)) %
          frameCount,
      );
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // Each play operation starts from the current frame. The RAF owns subsequent frames.
  }, [playing, sequence.fps, frameCount]);

  function updateProject(next: RigProject) {
    try {
      setProject(parseRigProject(next));
      setNotice(null);
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The project could not be updated.",
        error: true,
      });
    }
  }

  function updateKeyframe(field: "footLift" | "armAngle", value: number) {
    if (!Number.isFinite(value)) return;
    setPlaying(false);
    updateProject({
      ...project,
      timeline: {
        ...project.timeline,
        frames: project.timeline.frames.map((item, index) =>
          index === frame ? { ...item, [field]: value } : item,
        ),
      },
    });
  }

  async function openProject(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 256 * 1024)
        throw new Error("Choose a rig project smaller than 256 KiB.");
      const next = parseRigProject(JSON.parse(await file.text()));
      setProject(next);
      setPlaying(false);
      setFrame(0);
      setNotice({
        text: "Rig project reopened. Mesh settings and all 12 running keyframes are restored.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "This rig project could not be opened.",
        error: true,
      });
    }
  }

  function saveProject() {
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2) + "\n"], {
        type: "application/json",
      }),
      "denim-daytrip.rig-project.json",
    );
    setNotice({
      text: "Rig project saved. Reopen this file here to reproduce and edit the skeletal bake.",
    });
  }

  async function exportPack() {
    setExporting(true);
    try {
      downloadBlob(
        await createRigPack(project, candidate),
        "denim-daytrip-skeletal.character.zip",
      );
      setNotice({
        text: "Baked CharacterPack downloaded. It includes idle, walk and run and plays without this lab. Save the rig project separately for further authoring.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "CharacterPack export failed.",
        error: true,
      });
    } finally {
      setExporting(false);
    }
  }

  async function exportFrame() {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(framePixels(candidate, animation, frame)),
        192,
        256,
      ),
      0,
      0,
    );
    if (facing === "left") {
      const source = document.createElement("canvas");
      source.width = 192;
      source.height = 256;
      source.getContext("2d")!.drawImage(canvas, 0, 0);
      context.clearRect(0, 0, 192, 256);
      context.translate(192, 0);
      context.scale(-1, 1);
      context.imageSmoothingEnabled = false;
      context.drawImage(source, 0, 0);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) {
      downloadBlob(
        blob,
        `denim-skeletal-${animation}-${facing}-${String(frame + 1).padStart(2, "0")}.png`,
      );
      setNotice({
        text: "Native transparent frame downloaded. Inspection overlays are excluded.",
      });
    } else {
      setNotice({
        text: "The browser could not encode the frame PNG.",
        error: true,
      });
    }
  }

  function selectFrame(value: number) {
    setPlaying(false);
    setFrame((value + frameCount) % frameCount);
  }

  return (
    <div className="lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow">Gathria / Authoring experiment</p>
          <h1>Skeletal rig lab</h1>
          <p className="intro">
            Denim daytrip, one controlled comparison. Shape the limb mesh and
            running keyframes, inspect the result, then bake a portable
            character. The Studio default stays unchanged.
          </p>
        </div>
        <nav className="lab-nav" aria-label="Gathria tools">
          <a href="/editor.html">Character Studio</a>
          <a href="/player.html" target="_blank" rel="noreferrer">
            Independent player ↗
          </a>
        </nav>
      </header>

      <main className="lab-layout">
        <section
          className="preview-workspace"
          aria-label="Animation comparison"
        >
          <div className="playback-toolbar">
            <button
              className="primary play-button"
              onClick={() => setPlaying(!playing)}
              aria-pressed={playing}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <label>
              Action
              <select
                aria-label="Animation"
                value={animation}
                onChange={(event) => {
                  setPlaying(false);
                  setFrame(0);
                  setAnimation(event.target.value as AnimationName);
                }}
              >
                <option value="idle">Idle</option>
                <option value="walk">Walk</option>
                <option value="run">Run</option>
              </select>
            </label>
            <label>
              Facing
              <select
                aria-label="Facing"
                value={facing}
                onChange={(event) => setFacing(event.target.value as Facing)}
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label>
              Scale
              <select
                aria-label="Preview scale"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={1}>1× native</option>
                <option value={2}>2× pixels</option>
              </select>
            </label>
          </div>

          <div className="preview-scroll">
            <div className={`preview-pair zoom-${zoom}`}>
              <figure className="preview-card">
                <figcaption>
                  <h2>Production baseline</h2>
                  <p>V6 · Motion 3 · preserved composition</p>
                </figcaption>
                <Preview
                  character={baseline}
                  animation={animation}
                  frame={frame}
                  facing={facing}
                  zoom={zoom}
                  bones={false}
                  mesh={false}
                  id="baseline-preview"
                  label={`Production ${animation}, frame ${frame + 1}, facing ${facing}`}
                />
              </figure>
              <figure className="preview-card">
                <figcaption>
                  <h2>Skeletal experiment</h2>
                  <p>Same artwork · editable mesh and keyframes</p>
                </figcaption>
                <Preview
                  character={candidate}
                  animation={animation}
                  frame={frame}
                  facing={facing}
                  zoom={zoom}
                  inspection={inspection}
                  bones={bones}
                  mesh={mesh}
                  id="mesh-preview"
                  label={`Skeletal ${animation}, frame ${frame + 1}, facing ${facing}`}
                />
              </figure>
            </div>
          </div>
          <p className="preview-caption">
            192 × 256 px · anchor (96, 240) · transparent artwork · in-place
            playback
          </p>

          <div className="timeline">
            <div className="timeline-top">
              <label htmlFor="frame-slider">
                Frame {frame + 1} of {frameCount}
              </label>
              <span className="timeline-detail">
                {sequence.fps} fps · {(1000 / sequence.fps).toFixed(2)} ms per
                frame · {((1000 * frameCount) / sequence.fps).toFixed(2)} ms
                loop
              </span>
            </div>
            <input
              id="frame-slider"
              aria-label="Animation frame"
              type="range"
              min={0}
              max={frameCount - 1}
              value={frame}
              onChange={(event) => selectFrame(Number(event.target.value))}
            />
            <div className="frame-labels" aria-hidden="true">
              {Array.from({ length: frameCount }, (_, index) => (
                <span className={frame === index ? "current" : ""} key={index}>
                  {String(index + 1).padStart(2, "0")}
                </span>
              ))}
            </div>
            <div className="step-controls">
              <button onClick={() => selectFrame(frame - 1)}>
                ← Previous frame
              </button>
              <button onClick={() => selectFrame(frame + 1)}>
                Next frame →
              </button>
              <button onClick={() => void exportFrame()}>Save frame PNG</button>
            </div>
          </div>
        </section>

        <aside className="control-panel" aria-label="Rig authoring controls">
          <section className="control-group">
            <h3>Joint deformation</h3>
            <p className="helper">
              Shared by both arms and legs. Inspect sharp folds and texture
              stretching across the whole cycle.
            </p>
            <label className="slider-field" htmlFor="blend-radius">
              <span className="control-line">
                Blend radius{" "}
                <output>{project.mesh.blendRadius.toFixed(1)} px</output>
              </span>
              <input
                id="blend-radius"
                type="range"
                min={2}
                max={10}
                step={0.5}
                value={project.mesh.blendRadius}
                onChange={(event) =>
                  updateProject({
                    ...project,
                    mesh: {
                      ...project.mesh,
                      blendRadius: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="slider-field" htmlFor="joint-volume">
              <span className="control-line">
                Volume preservation{" "}
                <output>{Math.round(project.mesh.volume * 100)}%</output>
              </span>
              <input
                id="joint-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={project.mesh.volume}
                onChange={(event) =>
                  updateProject({
                    ...project,
                    mesh: {
                      ...project.mesh,
                      volume: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </section>

          <section className="control-group">
            <h3>Running keyframe {String(frame + 1).padStart(2, "0")}</h3>
            <p className="helper">
              Edit the current phase. The opposite limb follows six frames
              later. Idle and walk remain frozen.
            </p>
            <label className="slider-field" htmlFor="foot-lift">
              <span className="control-line">
                Foot lift <output>{keyframe?.footLift.toFixed(1)} px</output>
              </span>
              <input
                id="foot-lift"
                type="range"
                min={0}
                max={38}
                step={1}
                value={keyframe?.footLift ?? 0}
                disabled={animation !== "run" || playing}
                onChange={(event) =>
                  updateKeyframe("footLift", Number(event.target.value))
                }
              />
            </label>
            <label className="slider-field" htmlFor="arm-angle">
              <span className="control-line">
                Arm swing <output>{keyframe?.armAngle.toFixed(2)} rad</output>
              </span>
              <input
                id="arm-angle"
                type="range"
                min={-0.8}
                max={0.8}
                step={0.02}
                value={keyframe?.armAngle ?? 0}
                disabled={animation !== "run" || playing}
                onChange={(event) =>
                  updateKeyframe("armAngle", Number(event.target.value))
                }
              />
            </label>
          </section>

          <section className="control-group">
            <h3>Inspect the rig</h3>
            <p className="helper">
              Overlays show the posed geometry. They never enter exported frames
              or packs.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bones}
                disabled={animation !== "run"}
                onChange={(event) => setBones(event.target.checked)}
              />
              Show bones
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={mesh}
                disabled={animation !== "run"}
                onChange={(event) => setMesh(event.target.checked)}
              />
              Show mesh
            </label>
            <div className="legend">
              <span>Near limb</span>
              <span>Far limb</span>
            </div>
          </section>

          <section className="control-group">
            <h3>Save and bake</h3>
            <p className="helper">
              The project keeps editable rig settings. The CharacterPack
              contains baked frames for independent playback.
            </p>
            <div className="artifact-buttons">
              <button onClick={saveProject}>Save rig project</button>
              <button onClick={() => importRef.current?.click()}>
                Open rig project
              </button>
              <button
                className="primary"
                disabled={exporting}
                onClick={() => void exportPack()}
              >
                {exporting ? "Baking pack…" : "Bake CharacterPack"}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setFrame(0);
                  setProject(createDefaultProject());
                  setNotice({
                    text: "Default experiment restored. Previously downloaded projects are unchanged.",
                  });
                }}
              >
                Restore experiment
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              aria-label="Open rig project JSON"
              accept=".json,application/json"
              onChange={(event) => {
                void openProject(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </section>
        </aside>
      </main>

      {notice && (
        <p
          className={`status${notice.error ? " error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <footer className="scope-note">
        <p>
          This is a Denim-only authoring trial built with local bones, weighted
          meshes and keyframes. It uses no Spine software, Spine runtime or
          online drawing service.
        </p>
        <p>
          Keep the rig project to reproduce this experiment. Opening only its
          character configuration in ordinary Studio recreates the production
          Motion 3 character. Existing V1–V7 configurations and packs keep their
          original behavior.
        </p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<RigLab />);
