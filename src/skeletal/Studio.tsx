import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadBlob } from "../core/pack";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { prepareRig } from "./renderer";
import { createBakedPack } from "./bake";
import {
  decodeAttachment,
  exportProject,
  exportSkinPack,
  exportTemplate,
  importProject,
  importSkinPack,
  validateSkinMetadata,
  validateSkin,
} from "./skin-io";
import {
  ALL_SLOTS,
  CHAINS,
  type AnimationName,
  type AuthoringProject,
  type ChainName,
  type Expression,
  type Facing,
  type Point,
  type RigInspection,
  type SkinPack,
  type Slot,
} from "./types";
import "./studio.css";

const LABELS: Record<ChainName, string> = {
  nearArm: "Near arm",
  farArm: "Far arm",
  nearLeg: "Near leg",
  farLeg: "Far leg",
};
const EMPTY = new Uint8ClampedArray(192 * 256 * 4);
const human = (value: string) => value.replaceAll("-", " ");
const fileStem = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "character";

type Notice = { text: string; error?: boolean };

function Canvas({
  pixels,
  zoom,
  facing = "right",
  inspection,
  showBones = false,
  showMesh = false,
  markers,
  id,
  label,
  frame,
}: {
  pixels: Uint8ClampedArray;
  zoom: number;
  facing?: Facing;
  inspection?: RigInspection;
  showBones?: boolean;
  showMesh?: boolean;
  markers?: readonly Point[];
  id: string;
  label: string;
  frame?: number;
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
        new ImageData(new Uint8ClampedArray(pixels), 192, 256),
        0,
        0,
      );
    context.resetTransform();
    context.clearRect(0, 0, 192 * zoom, 256 * zoom);
    context.scale(zoom, zoom);
    context.imageSmoothingEnabled = false;
    if (facing === "left") {
      context.translate(192, 0);
      context.scale(-1, 1);
    }
    context.drawImage(source, 0, 0);
    const line = (points: readonly Point[], color: string, dots = true) => {
      context.strokeStyle = "#fffdf7";
      context.lineWidth = 3;
      context.beginPath();
      points.forEach(([x, y], index) => {
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.stroke();
      context.strokeStyle = color;
      context.lineWidth = 1.25;
      context.stroke();
      if (dots) {
        for (const [x, y] of points) {
          context.beginPath();
          context.arc(x, y, 2.5, 0, Math.PI * 2);
          context.fillStyle = "#fffdf7";
          context.fill();
          context.stroke();
        }
      }
    };
    if (inspection) {
      for (const limb of inspection.limbs) {
        const color = limb.id.toLowerCase().includes("far")
          ? "#168aa7"
          : "#c86e25";
        if (showMesh) {
          context.globalAlpha = 0.7;
          context.strokeStyle = color;
          context.lineWidth = 0.5;
          context.beginPath();
          for (let i = 0; i < limb.triangles.length; i += 3) {
            const a = limb.vertices[limb.triangles[i]];
            const b = limb.vertices[limb.triangles[i + 1]];
            const c = limb.vertices[limb.triangles[i + 2]];
            context.moveTo(a[0], a[1]);
            context.lineTo(b[0], b[1]);
            context.lineTo(c[0], c[1]);
            context.closePath();
          }
          context.stroke();
          context.globalAlpha = 1;
        }
        if (showBones) line(limb.bones, color);
      }
    }
    if (markers) line(markers, "#b95822");
    context.resetTransform();
  }, [pixels, zoom, facing, inspection, showBones, showMesh, markers]);
  return (
    <div
      className="skin-canvas"
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
        data-facing={facing}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="skin-number">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) onChange(value);
        }}
      />
    </label>
  );
}

export function SkinStudio() {
  const [project, setProject] = useState<AuthoringProject>(() =>
    createAuthoringProject(),
  );
  const [resetBindings, setResetBindings] = useState(() =>
    structuredClone(project.skin.metadata.bindings),
  );
  const [nameDraft, setNameDraft] = useState(project.skin.metadata.name);
  useEffect(
    () => setNameDraft(project.skin.metadata.name),
    [project.skin.metadata.name],
  );
  const [slot, setSlot] = useState<Slot>("torso");
  const [chain, setChain] = useState<ChainName>("nearArm");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [bones, setBones] = useState(false);
  const [mesh, setMesh] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const skinInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const { animation, facing, expression } = project.preview;
  const clip = project.motions.clips[animation];
  const sequenceFrame =
    ((Math.trunc(frame) % clip.sequence.length) + clip.sequence.length) %
    clip.sequence.length;
  const keyIndex = clip.sequence[sequenceFrame];
  const rig = useMemo(
    () => prepareRig(project.rig, project.skin, project.motions),
    [project.rig, project.skin, project.motions],
  );
  const pixels = useMemo(
    () => rig.frame(animation, keyIndex, expression),
    [rig, animation, keyIndex, expression],
  );
  const inspection = useMemo(
    () =>
      bones || mesh ? rig.inspect(animation, keyIndex, expression) : undefined,
    [rig, animation, keyIndex, expression, bones, mesh],
  );
  const joints = project.skin.metadata.bindings.chains[chain];
  const jointLabels = chain.endsWith("Arm")
    ? ["Shoulder", "Elbow", "Wrist"]
    : ["Hip", "Knee", "Ankle"];
  const offset = project.skin.metadata.bindings.offsets[slot] ?? [0, 0];
  const sourcePixels = useMemo(() => {
    const original = project.skin.images[slot];
    if (!original) return EMPTY;
    if (!offset[0] && !offset[1]) return original;
    const shifted = new Uint8ClampedArray(original.length);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 192; x++) {
        const dx = x + Math.round(offset[0]),
          dy = y + Math.round(offset[1]);
        if (dx < 0 || dx >= 192 || dy < 0 || dy >= 256) continue;
        const src = (y * 192 + x) * 4;
        shifted.set(original.subarray(src, src + 4), (dy * 192 + dx) * 4);
      }
    }
    return shifted;
  }, [project.skin.images, slot, offset[0], offset[1]]);

  useEffect(() => {
    if (!playing || busy) return;
    let request = 0;
    const start = performance.now();
    const first = sequenceFrame;
    const tick = (now: number) => {
      setFrame(
        (first + Math.floor((Math.max(0, now - start) * clip.fps) / 1000)) %
          clip.sequence.length,
      );
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // Each play operation starts from the selected frame; the clock owns later frames.
  }, [playing, busy, animation, clip]);

  function updatePreview(patch: Partial<AuthoringProject["preview"]>) {
    setProject((previous) => ({
      ...previous,
      preview: { ...previous.preview, ...patch },
    }));
    if (patch.animation) setFrame(0);
  }

  // Validate the renderer before replacing live state. Syntactically valid
  // PNGs can still leave an empty limb mesh after ownership and offsets.
  function applyProject(next: AuthoringProject) {
    const candidate = prepareRig(next.rig, next.skin, next.motions);
    const preview = next.preview;
    candidate.frame(
      preview.animation,
      next.motions.clips[preview.animation].sequence[0],
      preview.expression,
    );
    setPlaying(false);
    setProject(next);
  }

  function updateMetadata(
    update: (metadata: SkinPack["metadata"]) => SkinPack["metadata"],
  ) {
    try {
      const metadata = validateSkinMetadata(update(project.skin.metadata));
      applyProject({ ...project, skin: { ...project.skin, metadata } });
      setNotice(null);
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Invalid binding.",
        error: true,
      });
    }
  }

  function replaceSkin(skin: SkinPack) {
    applyProject({ ...project, skin });
    setResetBindings(structuredClone(skin.metadata.bindings));
    setFrame(0);
    setNotice({
      text: `${skin.metadata.name} loaded. The skeleton and shared motion library are unchanged.`,
    });
  }

  async function runTask(label: string, task: () => Promise<string>) {
    setPlaying(false);
    setBusy(label);
    setNotice(null);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      setNotice({ text: await task() });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The file could not be processed.",
        error: true,
      });
    } finally {
      setBusy(null);
    }
  }

  async function loadImage(file: File) {
    await runTask("Importing attachment…", async () => {
      const decoded = await decodeAttachment(file);
      const slots = project.skin.metadata.slots.includes(slot)
        ? project.skin.metadata.slots
        : [...project.skin.metadata.slots, slot];
      const metadata = validateSkinMetadata({
        ...project.skin.metadata,
        slots,
        provenance: `${project.skin.metadata.provenance}\nReplaced ${slot} with user-supplied PNG: ${file.name}.`,
      });
      const skin = validateSkin({
        metadata,
        images: { ...project.skin.images, [slot]: decoded.pixels },
      });
      applyProject({ ...project, skin });
      return `${human(slot)} replaced; its binding is preserved.${decoded.thresholdedPixels ? ` ${decoded.thresholdedPixels} partially transparent pixels were converted to crisp transparency.` : ""}`;
    });
  }

  function moveJoint(joint: number, axis: number, value: number) {
    updateMetadata((metadata) => {
      const points = metadata.bindings.chains[chain].map((point, index) =>
        index === joint
          ? point.map((coordinate, a) => (a === axis ? value : coordinate))
          : [...point],
      ) as unknown as typeof joints;
      return {
        ...metadata,
        bindings: {
          ...metadata.bindings,
          chains: { ...metadata.bindings.chains, [chain]: points },
        },
      };
    });
  }

  const skinName = project.skin.metadata.name;
  return (
    <main className="skin-studio">
      <header className="skin-header">
        <div>
          <a href="/" className="skin-brand">
            Gathria Character
          </a>
          <h1>Skin &amp; skeleton studio</h1>
          <p>One skeleton. Shared motions. Your own character artwork.</p>
        </div>
        <nav aria-label="Other workspaces">
          <a href="/rig-lab.html">Denim rig lab</a>
          <a href="/player.html" target="_blank" rel="noreferrer">
            Independent player ↗
          </a>
        </nav>
      </header>

      <div
        className="skin-notice"
        role={notice?.error ? "alert" : "status"}
        aria-live="polite"
      >
        {busy ??
          notice?.text ??
          "Start with a skin, replace a part, then check its binding in motion."}
      </div>

      <fieldset className="skin-workspace" disabled={busy !== null}>
        <legend className="skin-sr-only">Character authoring</legend>
        <aside className="skin-panel skin-files">
          <h2>1 · Choose artwork</h2>
          <label>
            Example skin
            <select
              aria-label="Example skin"
              value={
                project.skin.metadata.id === "denim-daytrip" ||
                project.skin.metadata.id === "coral-afternoon"
                  ? project.skin.metadata.id
                  : "custom"
              }
              onChange={(event) => {
                try {
                  replaceSkin(
                    createBuiltinSkin(
                      event.target.value as "denim-daytrip" | "coral-afternoon",
                    ),
                  );
                } catch (error) {
                  setNotice({
                    text:
                      error instanceof Error
                        ? error.message
                        : "The skin could not be rendered.",
                    error: true,
                  });
                }
              }}
            >
              <option value="denim-daytrip">Denim daytrip</option>
              <option value="coral-afternoon">Coral afternoon</option>
              {project.skin.metadata.id !== "denim-daytrip" &&
                project.skin.metadata.id !== "coral-afternoon" && (
                  <option value="custom">Imported skin</option>
                )}
            </select>
          </label>
          <label>
            Character name
            <input
              aria-label="Character name"
              value={nameDraft}
              maxLength={60}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                updateMetadata((metadata) => ({
                  ...metadata,
                  name: nameDraft,
                }));
                setNameDraft(nameDraft.trim() || project.skin.metadata.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
          <p className="skin-help">
            Skin packs contain transparent artwork and bindings. Swapping a skin
            keeps the same skeleton and actions.
          </p>
          <div className="skin-button-row">
            <button onClick={() => skinInput.current?.click()}>
              Import skin ZIP
            </button>
            <button
              onClick={() =>
                runTask("Saving skin…", async () => {
                  downloadBlob(
                    await exportSkinPack(project.skin),
                    `${fileStem(skinName)}.skin.zip`,
                  );
                  return "Skin saved with its artwork and bindings.";
                })
              }
            >
              Save skin ZIP
            </button>
          </div>
          <button
            className="skin-wide"
            onClick={() =>
              runTask("Preparing template…", async () => {
                downloadBlob(
                  await exportTemplate(project.skin),
                  `${fileStem(skinName)}.template.zip`,
                );
                return "Template saved. Keep each part on its 192 × 256 transparent canvas and use the landmark guide.";
              })
            }
          >
            Download artwork template
          </button>
          <hr />
          <h2>2 · Replace a part</h2>
          <label>
            Attachment
            <select
              aria-label="Attachment"
              value={slot}
              onChange={(event) => {
                const next = event.target.value as Slot;
                setSlot(next);
                if (next.startsWith("near-") || next.startsWith("far-")) {
                  const side = next.startsWith("near-") ? "near" : "far";
                  setChain(
                    `${side}${next.includes("arm") ? "Arm" : "Leg"}` as ChainName,
                  );
                }
              }}
            >
              {ALL_SLOTS.map((value) => (
                <option value={value} key={value}>
                  {human(value)}
                  {!project.skin.images[value] ? " (empty)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            className="skin-wide"
            onClick={() => imageInput.current?.click()}
          >
            Replace selected PNG
          </button>
          <p className="skin-help">
            192 × 256, transparent PNG, up to 1 MiB. This changes only the
            selected attachment; its binding remains in place.
          </p>
          <details className="skin-details">
            <summary>Source &amp; version</summary>
            <p>
              {project.rig.id}
              <br />
              Motion library: {project.motions.id}
            </p>
            <p className="skin-provenance">
              {project.skin.metadata.provenance}
            </p>
          </details>
        </aside>

        <section
          className="skin-panel skin-preview-panel"
          aria-labelledby="preview-title"
        >
          <div className="skin-section-heading">
            <div>
              <h2 id="preview-title">3 · Check the movement</h2>
              <p className="skin-help">
                Stationary playback · anchor (96, 240)
              </p>
            </div>
            <label className="skin-zoom">
              Zoom
              <select
                aria-label="Zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </div>
          <div className="skin-action-controls">
            <label>
              Action
              <select
                aria-label="Action"
                value={animation}
                onChange={(event) =>
                  updatePreview({
                    animation: event.target.value as AnimationName,
                  })
                }
              >
                <option value="idle">Idle</option>
                <option value="walk">Walk</option>
                <option value="run">Run</option>
              </select>
            </label>
            <label>
              Expression
              <select
                aria-label="Expression"
                value={expression}
                onChange={(event) =>
                  updatePreview({
                    expression: event.target.value as Expression,
                  })
                }
              >
                <option value="neutral">Neutral</option>
                <option value="gentle">Gentle smile</option>
                <option value="joyful">Joyful</option>
              </select>
            </label>
            <label>
              Facing
              <select
                aria-label="Facing"
                value={facing}
                onChange={(event) =>
                  updatePreview({ facing: event.target.value as Facing })
                }
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          </div>
          <div className="skin-canvases">
            <figure>
              <Canvas
                pixels={pixels}
                zoom={zoom}
                facing={facing}
                inspection={inspection}
                showBones={bones}
                showMesh={mesh}
                id="skin-posed-canvas"
                label={`${skinName}, ${animation}, ${facing}, frame ${sequenceFrame + 1}`}
                frame={sequenceFrame}
              />
              <figcaption>Posed character · {skinName}</figcaption>
            </figure>
            <figure>
              <Canvas
                pixels={sourcePixels}
                zoom={zoom}
                markers={joints}
                id="skin-source-canvas"
                label={`Source attachment: ${human(slot)}, with ${LABELS[chain].toLowerCase()} landmarks`}
              />
              <figcaption>
                Source · {human(slot)}
                <br />
                {LABELS[chain]} landmarks · facing right
              </figcaption>
            </figure>
          </div>
          <div className="skin-playback">
            <button
              className="skin-primary"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              aria-label="Previous frame"
              onClick={() => {
                setPlaying(false);
                setFrame(
                  (sequenceFrame + clip.sequence.length - 1) %
                    clip.sequence.length,
                );
              }}
            >
              ←
            </button>
            <input
              type="range"
              aria-label="Animation frame"
              min={0}
              max={clip.sequence.length - 1}
              value={sequenceFrame}
              onChange={(event) => {
                setPlaying(false);
                setFrame(Number(event.target.value));
              }}
            />
            <button
              aria-label="Next frame"
              onClick={() => {
                setPlaying(false);
                setFrame((sequenceFrame + 1) % clip.sequence.length);
              }}
            >
              →
            </button>
            <output>
              Frame {sequenceFrame + 1}/{clip.sequence.length} · {clip.fps} fps
            </output>
          </div>
          <div className="skin-overlays">
            <label>
              <input
                type="checkbox"
                checked={bones}
                onChange={(event) => setBones(event.target.checked)}
              />
              Bones
            </label>
            <label>
              <input
                type="checkbox"
                checked={mesh}
                onChange={(event) => setMesh(event.target.checked)}
              />
              Mesh
            </label>
            <span>Orange: near limbs · blue: far limbs</span>
          </div>
        </section>

        <aside className="skin-panel skin-bindings">
          <h2>4 · Adjust the binding</h2>
          <label>
            Joint chain
            <select
              aria-label="Joint chain"
              value={chain}
              onChange={(event) => setChain(event.target.value as ChainName)}
            >
              {CHAINS.map((value) => (
                <option key={value} value={value}>
                  {LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <p className="skin-help">
            Place source landmarks at the artwork’s joints. Both limb pieces
            share the middle joint.
          </p>
          <div className="skin-joints">
            {joints.map((point, index) => (
              <div className="skin-joint" key={`${chain}-${index}`}>
                <strong>{jointLabels[index]}</strong>
                <NumberField
                  label={`${jointLabels[index]} X`}
                  value={point[0]}
                  min={0}
                  max={191}
                  onChange={(value) => moveJoint(index, 0, value)}
                />
                <NumberField
                  label={`${jointLabels[index]} Y`}
                  value={point[1]}
                  min={0}
                  max={255}
                  onChange={(value) => moveJoint(index, 1, value)}
                />
              </div>
            ))}
          </div>
          <h3>Selected attachment</h3>
          <p className="skin-help">{human(slot)} · offset in source pixels</p>
          <div className="skin-pair">
            {[0, 1].map((axis) => (
              <NumberField
                key={axis}
                label={`Offset ${axis ? "Y" : "X"}`}
                value={offset[axis]}
                min={-32}
                max={32}
                onChange={(value) =>
                  updateMetadata((metadata) => ({
                    ...metadata,
                    bindings: {
                      ...metadata.bindings,
                      offsets: {
                        ...metadata.bindings.offsets,
                        [slot]: axis
                          ? [offset[0], Math.round(value)]
                          : [Math.round(value), offset[1]],
                      },
                    },
                  }))
                }
              />
            ))}
          </div>
          <h3>Joint deformation</h3>
          <div className="skin-pair">
            <NumberField
              label="Blend radius"
              value={project.skin.metadata.bindings.mesh.blendRadius}
              min={1}
              max={16}
              onChange={(value) =>
                updateMetadata((metadata) => ({
                  ...metadata,
                  bindings: {
                    ...metadata.bindings,
                    mesh: { ...metadata.bindings.mesh, blendRadius: value },
                  },
                }))
              }
            />
            <NumberField
              label="Volume"
              value={project.skin.metadata.bindings.mesh.volume}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) =>
                updateMetadata((metadata) => ({
                  ...metadata,
                  bindings: {
                    ...metadata.bindings,
                    mesh: { ...metadata.bindings.mesh, volume: value },
                  },
                }))
              }
            />
          </div>
          <button
            className="skin-wide"
            onClick={() =>
              updateMetadata((metadata) => ({
                ...metadata,
                bindings: structuredClone(resetBindings),
              }))
            }
          >
            Reset bindings to loaded skin
          </button>
          <p className="skin-help">
            Reset keeps your replacement artwork. Check bent joints and the loop
            after editing.
          </p>
        </aside>
      </fieldset>

      <section
        className="skin-panel skin-delivery"
        aria-labelledby="save-title"
      >
        <div>
          <h2 id="save-title">Save your work</h2>
          <p>
            <strong>Project</strong> keeps the skeleton, motions, artwork,
            bindings and preview settings. <strong>CharacterPack</strong>{" "}
            contains baked frames for independent playback.
          </p>
          <p className="skin-help">
            Imported artwork is reproduced from the saved project. Its
            compatibility appearance file alone cannot recreate it in the main
            Studio.
          </p>
        </div>
        <div className="skin-delivery-actions">
          <button
            disabled={busy !== null}
            onClick={() => projectInput.current?.click()}
          >
            Open project ZIP
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              runTask("Saving project…", async () => {
                downloadBlob(
                  await exportProject(project),
                  `${fileStem(skinName)}.rig-project.zip`,
                );
                return "Complete authoring project saved.";
              })
            }
          >
            Save project ZIP
          </button>
          <button
            className="skin-primary"
            disabled={busy !== null}
            onClick={() =>
              runTask("Baking CharacterPack…", async () => {
                downloadBlob(
                  await createBakedPack(project),
                  `${fileStem(skinName)}.character.zip`,
                );
                return `CharacterPack exported with idle, walk and run in the ${expression} expression. Load it in the independent player.`;
              })
            }
          >
            Export CharacterPack
          </button>
        </div>
      </section>
      <footer className="skin-footer">
        V6 humanoid family · fixed proportions · local generation · no drawing
        API or Spine runtime
      </footer>

      <input
        hidden
        ref={skinInput}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import skin file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file)
            void runTask("Importing skin…", async () => {
              const skin = await importSkinPack(file);
              replaceSkin(skin);
              return `${skin.metadata.name} imported. Shared skeleton and motions preserved.`;
            });
        }}
      />
      <input
        hidden
        ref={projectInput}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import project file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file)
            void runTask("Opening project…", async () => {
              const next = await importProject(file);
              applyProject(next);
              setResetBindings(structuredClone(next.skin.metadata.bindings));
              setFrame(0);
              return `${next.skin.metadata.name} project opened with its artwork, bindings and motions.`;
            });
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,.png"
        aria-label="Replace attachment file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void loadImage(file);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<SkinStudio />);
