import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadBlob } from "../core/pack";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { prepareRig } from "./renderer";
import { createBakedPack } from "./bake";
import { createMotionLibrary, createMotionLibraryV2 } from "./definition";
import { BindingCanvas } from "./BindingCanvas";
import { MotionEditor } from "./MotionEditor";
import { WardrobePanel } from "./WardrobePanel";
import { WardrobeLibrary } from "./WardrobeLibrary";
import { IdentityLibrary } from "./IdentityLibrary";
import {
  addWardrobeIdentity,
  createWardrobeIdentityTemplate,
  removeWardrobeIdentity,
  selectWardrobeIdentity,
} from "./identities";
import { exportWardrobeIdentity, importWardrobeIdentity } from "./identity-io";
import { applyWardrobe, defaultWardrobeRecipe } from "./wardrobe";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  removeWardrobeItem,
} from "./wardrobe-items";
import { exportWardrobeItem, importWardrobeItem } from "./wardrobe-item-io";
import type { WardrobeItemGroup, WardrobeRecipe } from "./wardrobe-types";
import { playbackFrame, playbackTick } from "./playback";
import {
  beginEdit,
  cancelEdit,
  createHistory,
  finishEdit,
  recordEdit,
  redoEdit,
  replaceView,
  undoEdit,
} from "./history";
import {
  decodeAttachment,
  exportProject,
  exportSkinPack,
  exportTemplate,
  importProject,
  importSkinPack,
  validateSkinMetadata,
  validateSkin,
  validateProject,
} from "./skin-io";
import {
  ALL_SLOTS,
  V1_SLOTS,
  V2_SLOTS,
  type JointTriple,
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
  type MotionClip,
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
  skeletonOnly = false,
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
  skeletonOnly?: boolean;
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
    if (!skeletonOnly) context.drawImage(source, 0, 0);
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
      if (showBones && inspection.bodyBones) {
        for (const bone of inspection.bodyBones)
          line([bone.from, bone.to], "#7063a1");
        const torso = inspection.bodyBones.find((bone) => bone.id === "torso");
        if (torso) {
          // Show the actual connection to each posed limb. These guide lines
          // never enter the skin, project attachments, or baked spritesheet.
          for (const limb of inspection.limbs)
            line(
              [
                limb.id.toLowerCase().includes("arm") ? torso.to : torso.from,
                limb.bones[0],
              ],
              "#7063a1",
              false,
            );
        }
      }
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
  }, [
    pixels,
    zoom,
    facing,
    inspection,
    showBones,
    showMesh,
    skeletonOnly,
    markers,
  ]);
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
        data-view={skeletonOnly ? "skeleton" : "character"}
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
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    if (draft === String(value)) return;
    const next = draft.trim() === "" ? Number.NaN : Number(draft);
    // Reset even if the owner rejects a geometrically invalid joint. In that
    // case the saved value stays unchanged, so its effect will not run again.
    setDraft(String(value));
    if (!Number.isFinite(next) || next < min || next > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(next);
  };
  return (
    <label className="skin-number">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(value));
            setInvalid(false);
          }
        }}
      />
      {invalid && (
        <small role="status">
          Use {min}–{max}; kept previous value.
        </small>
      )}
    </label>
  );
}

export function SkinStudio() {
  const [history, setHistory] = useState(() => {
    const project = createAuthoringProject();
    return createHistory({
      project,
      resetBindings: structuredClone(project.skin.metadata.bindings),
    });
  });
  const { project, resetBindings } = history.present;
  const [nameDraft, setNameDraft] = useState(project.skin.metadata.name);
  useEffect(
    () => setNameDraft(project.skin.metadata.name),
    [project.skin.metadata.name],
  );
  const [slot, setSlot] = useState<Slot>("torso");
  const availableSlots =
    project.skin.metadata.version >= 3
      ? ALL_SLOTS.filter(
          (s) =>
            V1_SLOTS.includes(s as (typeof V1_SLOTS)[number]) ||
            project.skin.metadata.slots.includes(s),
        )
      : project.skin.metadata.version === 2
        ? V2_SLOTS
        : V1_SLOTS;
  // A wardrobe switch or undo may replace a v2 skin with a v1 skin.
  // Keep the source editor on a valid attachment after either transition.
  useEffect(() => {
    if (!(availableSlots as readonly Slot[]).includes(slot)) setSlot("torso");
  }, [availableSlots, slot]);
  const [chain, setChain] = useState<ChainName>("nearArm");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [bones, setBones] = useState(false);
  const [skeletonOnly, setSkeletonOnly] = useState(false);
  const [mesh, setMesh] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const skinInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const clothingInput = useRef<HTMLInputElement>(null);
  const identityInput = useRef<HTMLInputElement>(null);
  const { animation, facing, expression } = project.preview;
  // Validation guarantees the saved preview names an available action.
  const clip = project.motions.clips[animation]!;
  const sequenceFrame = playbackFrame(clip, frame);
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
      bones || mesh || skeletonOnly
        ? rig.inspect(animation, keyIndex, expression)
        : undefined,
    [rig, animation, keyIndex, expression, bones, mesh, skeletonOnly],
  );
  const sourceLeg =
    project.skin.metadata.runLegs &&
    (chain === "nearLeg" || chain === "farLeg") &&
    project.skin.metadata.runLegs[chain].slot === slot
      ? project.skin.metadata.runLegs[chain]
      : undefined;
  const sourceShoe =
    project.skin.metadata.runShoes &&
    (chain === "nearLeg" || chain === "farLeg") &&
    project.skin.metadata.runShoes[chain].slot === slot
      ? project.skin.metadata.runShoes[chain]
      : undefined;
  const followSourceShoe =
    project.skin.metadata.version === 4 &&
    sourceShoe &&
    (chain === "nearLeg" || chain === "farLeg")
      ? project.skin.metadata.runShoes[chain]
      : undefined;
  const joints: readonly Point[] =
    sourceLeg?.joints ??
    (sourceShoe
      ? [
          ...(followSourceShoe ? [followSourceShoe.sourceShin] : []),
          sourceShoe.ankle,
        ]
      : project.skin.metadata.bindings.chains[chain]);
  const jointLabels = sourceShoe
    ? [...(followSourceShoe ? ["Source shin"] : []), "Source ankle"]
    : chain.endsWith("Arm")
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
      const next = playbackTick(clip, first, now - start);
      setFrame(next.frame);
      if (next.finished) {
        setPlaying(false);
        return;
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // Each play operation starts from the selected frame; the clock owns later frames.
  }, [playing, busy, animation, clip]);

  function updatePreview(patch: Partial<AuthoringProject["preview"]>) {
    setHistory((previous) =>
      replaceView(previous, {
        ...previous.present,
        project: {
          ...previous.present.project,
          preview: { ...previous.present.project.preview, ...patch },
        },
      }),
    );
    if (patch.animation) setFrame(0);
  }

  // Validate the renderer before replacing live state. Syntactically valid
  // PNGs can still leave an empty limb mesh after ownership and offsets.
  function applyProject(
    next: AuthoringProject,
    label = "Edit character",
    loadedBindings = resetBindings,
  ) {
    const candidate = prepareRig(next.rig, next.skin, next.motions);
    // A valid first pose does not prove the remaining coupled run constraints.
    // Reject unsupported V4 edits/imports atomically before replacing live state.
    if (next.skin.metadata.version === 4)
      for (let key = 0; key < next.motions.clips.run.keys.length; key++) {
        try {
          candidate.frame("run", key, next.preview.expression);
        } catch (error) {
          throw Error(
            `Run pose ${key + 1}: ${error instanceof Error ? error.message : "unsupported shoe support"}`,
          );
        }
      }
    const preview = next.preview;
    candidate.frame(
      preview.animation,
      next.motions.clips[preview.animation]!.sequence[0],
      preview.expression,
    );
    setPlaying(false);
    setHistory((previous) =>
      recordEdit(
        previous,
        { project: next, resetBindings: loadedBindings },
        label,
      ),
    );
  }

  function updateMetadata(
    update: (metadata: SkinPack["metadata"]) => SkinPack["metadata"],
    label = "Edit binding",
    keepWardrobe = false,
  ) {
    try {
      const metadata = validateSkinMetadata(update(project.skin.metadata));
      if (JSON.stringify(metadata) === JSON.stringify(project.skin.metadata))
        return;
      applyProject(
        {
          ...project,
          skin: { ...project.skin, metadata },
          wardrobe: keepWardrobe ? project.wardrobe : undefined,
        },
        label,
      );
      setNotice(
        project.wardrobe && !keepWardrobe
          ? {
              text: "Custom artwork; open wardrobe to create a new assembled look. Your edited artwork and binding are preserved.",
            }
          : null,
      );
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Invalid binding.",
        error: true,
      });
    }
  }

  function replaceSkin(skin: SkinPack) {
    applyProject(
      { ...project, skin, wardrobe: undefined },
      "Replace skin",
      structuredClone(skin.metadata.bindings),
    );
    setFrame(0);
    setNotice({
      text: `${skin.metadata.name} loaded. The skeleton and shared motion library are unchanged.`,
    });
  }

  function changeWardrobe(recipe: WardrobeRecipe, label: string) {
    if (JSON.stringify(recipe) === JSON.stringify(project.wardrobe)) return;
    try {
      const next = applyWardrobe(project, recipe);
      applyProject(next, label, structuredClone(next.skin.metadata.bindings));
      setNotice({
        text: `${label}. Clothing, identity and colors are saved together in the project; the skeleton and motions are unchanged.`,
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The look could not be assembled.",
        error: true,
      });
    }
  }

  function openWardrobe() {
    const knownIdentity =
      project.skin.metadata.id === "coral-afternoon" ||
      project.skin.metadata.id.startsWith("wardrobe-waves-") ||
      project.skin.metadata.id.startsWith("wardrobe-v2-waves-")
        ? "waves"
        : "crop";
    changeWardrobe(defaultWardrobeRecipe(knownIdentity), "Open wardrobe");
  }

  async function saveItemTemplate(group: WardrobeItemGroup) {
    if (!project.wardrobe) return;
    await runTask("Preparing clothing template…", async () => {
      const item = createWardrobeItemTemplate(
        project.wardrobe!,
        group,
        project.wardrobeItems,
        project.wardrobeIdentities,
      );
      downloadBlob(await exportWardrobeItem(item), `${item.id}.wardrobe.zip`);
      return `${item.name} template saved. Edit its artwork, masks and item details, then import the clothing ZIP.`;
    });
  }

  async function saveClothing(id: string) {
    const item = project.wardrobeItems?.find(
      (candidate) => candidate.id === id,
    );
    if (!item) return;
    await runTask("Saving clothing…", async () => {
      downloadBlob(await exportWardrobeItem(item), `${item.id}.wardrobe.zip`);
      return `${item.name} saved with its artwork, color masks and binding.`;
    });
  }

  function removeClothing(id: string) {
    try {
      const next = removeWardrobeItem(project, id);
      applyProject(next, "Remove clothing item");
      setNotice({
        text: "Unused clothing removed from this project. Undo restores it.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The item could not be removed.",
        error: true,
      });
    }
  }

  function changeIdentity(id: string) {
    if (project.wardrobe?.identity === id) return;
    try {
      const next = selectWardrobeIdentity(project, id);
      applyProject(
        next,
        project.wardrobe
          ? "Change wardrobe identity"
          : "Use identity in new look",
        structuredClone(next.skin.metadata.bindings),
      );
      setNotice({
        text: project.wardrobe
          ? "Identity selected. Clothing and actions are preserved. Save the project to keep this look."
          : "Identity selected with the default outfit. Import prepared clothing to dress this character, or Undo to restore your previous artwork.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The identity could not be selected.",
        error: true,
      });
    }
  }

  async function saveIdentityTemplate() {
    if (!project.wardrobe) return;
    await runTask("Preparing identity template…", async () => {
      const identity = createWardrobeIdentityTemplate(
        project.wardrobe!,
        project.wardrobeIdentities,
      );
      downloadBlob(
        await exportWardrobeIdentity(identity),
        `${identity.id}.identity.zip`,
      );
      return `${identity.name} template saved with three expressions, registered hair and color masks. Edit its identity details and artwork, then import the identity ZIP.`;
    });
  }

  async function saveIdentity(id: string) {
    const identity = project.wardrobeIdentities?.find(
      (candidate) => candidate.id === id,
    );
    if (!identity) return;
    await runTask("Saving identity…", async () => {
      downloadBlob(
        await exportWardrobeIdentity(identity),
        `${identity.id}.identity.zip`,
      );
      return `${identity.name} saved with its expressions, color masks and registration.`;
    });
  }

  function removeIdentity(id: string) {
    try {
      const next = removeWardrobeIdentity(project, id);
      applyProject(next, "Remove identity");
      setNotice({
        text: "Unused identity removed from this project. Undo restores it.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The identity could not be removed.",
        error: true,
      });
    }
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
      applyProject(
        { ...project, skin, wardrobe: undefined },
        `Replace ${human(slot)} PNG`,
      );
      return `${human(slot)} replaced; its binding is preserved.${project.wardrobe ? " Custom artwork; open wardrobe to create a new assembled look." : ""}${decoded.thresholdedPixels ? ` ${decoded.thresholdedPixels} partially transparent pixels were converted to crisp transparency.` : ""}`;
    });
  }

  function changeMotion(next: MotionClip, label: string) {
    if (JSON.stringify(next) === JSON.stringify(clip)) return;
    try {
      const motions = {
        ...project.motions,
        clips: { ...project.motions.clips, [animation]: next },
      };
      const checked = validateProject({ ...project, motions });
      applyProject({ ...project, motions: checked.motions }, label);
      setNotice({
        text: `${label}. Shared motion applies to every skin; save a project to keep it.`,
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Invalid motion.",
        error: true,
      });
    }
  }

  function addJumpAction() {
    if (project.motions.clips.jump) return;
    try {
      const next = validateProject({
        ...project,
        motions: {
          ...project.motions,
          clips: {
            ...project.motions.clips,
            jump: createMotionLibrary().clips.jump!,
          },
        },
        preview: { ...project.preview, animation: "jump" },
      });
      applyProject(next, "Add jump action");
      setFrame(0);
      setNotice({
        text: "Jump added. Existing idle, walk and run motions are unchanged; save this project to keep the new action.",
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error ? error.message : "Jump could not be added.",
        error: true,
      });
    }
  }

  function travelHistory(direction: "undo" | "redo") {
    const available = direction === "undo" ? history.past : history.future;
    if (busy || history.transaction || !available.length) return;
    setPlaying(false);
    setHistory((previous) =>
      direction === "undo" ? undoEdit(previous) : redoEdit(previous),
    );
    setNotice({
      text: `${direction === "undo" ? "Undid" : "Redid"}: ${available.at(-1)!.label}.`,
    });
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        busy ||
        history.transaction
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "z" || (key === "y" && !event.metaKey)) {
        const direction = key === "y" || event.shiftKey ? "redo" : "undo";
        if (
          !(direction === "undo" ? history.past.length : history.future.length)
        )
          return;
        event.preventDefault();
        travelHistory(direction);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [history, busy]);

  function updateJoint(
    joint: number,
    point: Point,
    label = "Edit source landmark",
  ) {
    updateMetadata((metadata) => {
      if (
        sourceLeg &&
        metadata.version >= 3 &&
        metadata.runLegs &&
        (chain === "nearLeg" || chain === "farLeg")
      )
        return {
          ...metadata,
          runLegs: {
            ...metadata.runLegs,
            [chain]: {
              ...metadata.runLegs[chain],
              joints: metadata.runLegs[chain].joints.map((p, index) =>
                index === joint ? point : p,
              ) as unknown as JointTriple,
            },
          },
        };
      if (
        sourceShoe &&
        metadata.runShoes &&
        (chain === "nearLeg" || chain === "farLeg")
      ) {
        if (metadata.version === 4)
          return {
            ...metadata,
            runShoes: {
              ...metadata.runShoes,
              [chain]: {
                ...metadata.runShoes[chain],
                ...(joint === 0 ? { sourceShin: point } : { ankle: point }),
              },
            },
          };
        if (metadata.version === 3)
          return {
            ...metadata,
            runShoes: {
              ...metadata.runShoes,
              [chain]: { ...metadata.runShoes[chain], ankle: point },
            },
          };
      }
      return {
        ...metadata,
        bindings: {
          ...metadata.bindings,
          chains: {
            ...metadata.bindings.chains,
            [chain]: metadata.bindings.chains[chain].map((p, index) =>
              index === joint ? point : p,
            ),
          },
        },
      } as SkinPack["metadata"];
    }, label);
  }
  function moveJoint(joint: number, axis: number, value: number) {
    updateJoint(
      joint,
      joints[joint].map((coordinate, a) =>
        a === axis ? value : coordinate,
      ) as unknown as Point,
      `Move ${jointLabels[joint].toLowerCase()}`,
    );
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

      <div className="skin-edit-toolbar" aria-label="Edit history">
        <button
          aria-label="Undo edit"
          disabled={!!busy || !!history.transaction || !history.past.length}
          onClick={() => travelHistory("undo")}
          title={history.past.at(-1)?.label}
        >
          ↶ Undo
        </button>
        <button
          aria-label="Redo edit"
          disabled={!!busy || !!history.transaction || !history.future.length}
          onClick={() => travelHistory("redo")}
          title={history.future.at(-1)?.label}
        >
          ↷ Redo
        </button>
        <span>20 recent edits · Ctrl/⌘ Z to undo · Shift Z to redo</span>
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
                  <option value="custom">
                    {project.wardrobe ? "Wardrobe look" : "Imported skin"}
                  </option>
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
                updateMetadata(
                  (metadata) => ({
                    ...metadata,
                    name: nameDraft,
                  }),
                  "Rename character",
                  true,
                );
                setNameDraft(nameDraft.trim() || project.skin.metadata.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
          <WardrobePanel
            recipe={project.wardrobe}
            items={project.wardrobeItems}
            identities={project.wardrobeIdentities}
            detached={
              !project.wardrobe &&
              project.skin.metadata.id.startsWith("wardrobe-")
            }
            unknownArtwork={
              project.skin.metadata.id !== "denim-daytrip" &&
              project.skin.metadata.id !== "coral-afternoon" &&
              !project.skin.metadata.id.startsWith("wardrobe-waves-") &&
              !project.skin.metadata.id.startsWith("wardrobe-v2-waves-")
            }
            disabled={busy !== null || !!history.transaction}
            onOpen={openWardrobe}
            onChange={changeWardrobe}
            onIdentityChange={changeIdentity}
          />
          <IdentityLibrary
            identities={project.wardrobeIdentities ?? []}
            recipe={project.wardrobe}
            disabled={busy !== null || !!history.transaction}
            onImport={() => identityInput.current?.click()}
            onTemplate={() => void saveIdentityTemplate()}
            onSelect={changeIdentity}
            onExport={(id) => void saveIdentity(id)}
            onRemove={removeIdentity}
          />
          <WardrobeLibrary
            items={project.wardrobeItems ?? []}
            recipe={project.wardrobe}
            disabled={busy !== null || !!history.transaction}
            onImport={() => clothingInput.current?.click()}
            onTemplate={(group) => void saveItemTemplate(group)}
            onExport={(id) => void saveClothing(id)}
            onRemove={removeClothing}
          />
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
              {availableSlots.map((value) => (
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
          {project.skin.metadata.actionForearms && (
            <p className="skin-help">
              Active forearms are used for{" "}
              {Object.keys(project.skin.metadata.actionForearms).join(" and ")}.
              Idle and walk keep the relaxed forearms. Both pairs share the same
              elbow and wrist landmarks.
            </p>
          )}
          {project.skin.metadata.version >= 3 && (
            <p className="skin-help">
              Run alternatives have their own source landmarks. Selecting a bent
              leg or run shoe edits only that artwork registration; base body
              proportions stay unchanged. Other actions keep the base parts.
            </p>
          )}
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
                <option value="jump" disabled={!project.motions.clips.jump}>
                  Jump
                  {!project.motions.clips.jump ? " (not in this project)" : ""}
                </option>
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
          {!project.motions.clips.jump && (
            <div className="skin-missing-action">
              <p>
                This saved project has idle, walk and run. Add jump explicitly
                to keep its existing motions unchanged.
              </p>
              <button onClick={addJumpAction}>Add jump action</button>
            </div>
          )}
          <div className="skin-canvases">
            <figure>
              <Canvas
                pixels={pixels}
                zoom={zoom}
                facing={facing}
                inspection={inspection}
                showBones={bones || skeletonOnly}
                showMesh={mesh && !skeletonOnly}
                skeletonOnly={skeletonOnly}
                id="skin-posed-canvas"
                label={`${skinName}, ${animation}, ${facing}, frame ${sequenceFrame + 1}`}
                frame={sequenceFrame}
              />
              <figcaption>
                {skeletonOnly ? "Animated skeleton" : "Posed character"} ·{" "}
                {skinName}
              </figcaption>
            </figure>
            <figure>
              <BindingCanvas
                key={`${chain}-${sourceLeg || sourceShoe ? slot : "base"}`}
                pixels={sourcePixels}
                zoom={zoom}
                joints={joints}
                jointLabels={jointLabels}
                label={`Source attachment: ${human(slot)}, with ${LABELS[chain].toLowerCase()} landmarks`}
                disabled={busy !== null}
                onBegin={() => {
                  setPlaying(false);
                  setHistory((previous) =>
                    beginEdit(
                      previous,
                      `Move ${LABELS[chain].toLowerCase()} joint`,
                    ),
                  );
                }}
                onChange={(joint, point) => updateJoint(joint, point)}
                onCommit={() => setHistory((previous) => finishEdit(previous))}
                onCancel={() => {
                  setHistory((previous) => cancelEdit(previous));
                  setNotice({ text: "Joint move cancelled." });
                }}
              />
              <figcaption>
                Source · {human(slot)}
                <br />
                {sourceLeg || sourceShoe
                  ? "Alternative source"
                  : LABELS[chain]}{" "}
                landmarks · facing right
              </figcaption>
            </figure>
          </div>
          <div className="skin-playback">
            <button
              className="skin-primary"
              onClick={() => {
                if (
                  !playing &&
                  !clip.loop &&
                  sequenceFrame === clip.sequence.length - 1
                )
                  setFrame(0);
                setPlaying(!playing);
              }}
            >
              {playing
                ? "Pause"
                : !clip.loop && sequenceFrame === clip.sequence.length - 1
                  ? "Replay"
                  : "Play"}
            </button>
            <button
              aria-label="Previous frame"
              onClick={() => {
                setPlaying(false);
                setFrame(playbackFrame(clip, sequenceFrame - 1));
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
                setFrame(playbackFrame(clip, sequenceFrame + 1));
              }}
            >
              →
            </button>
            <output>
              Frame {sequenceFrame + 1}/{clip.sequence.length} · {clip.fps} fps
              {!clip.loop ? " · plays once" : ""}
            </output>
          </div>
          <div className="skin-overlays">
            <label>
              <input
                type="checkbox"
                checked={skeletonOnly}
                onChange={(event) => setSkeletonOnly(event.target.checked)}
              />
              Skeleton only
            </label>
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
                disabled={skeletonOnly}
                onChange={(event) => setMesh(event.target.checked)}
              />
              Mesh
            </label>
            <span>
              Purple: root, torso, head · orange: near limbs · blue: far limbs
            </span>
          </div>
          {skeletonOnly && (
            <p className="skin-help">
              The same animated bones drive each skin. Root → torso → head, with
              upper and lower arm/leg chains. This view hides artwork only;
              exports contain the character.
            </p>
          )}
          <MotionEditor
            animation={animation}
            libraryVersion={project.motions.version}
            followShinShoes={project.skin.metadata.version === 4}
            clip={clip}
            sequenceFrame={sequenceFrame}
            disabled={busy !== null || !!history.transaction}
            preview={
              <Canvas
                pixels={pixels}
                zoom={1}
                facing={facing}
                inspection={inspection}
                showBones={skeletonOnly}
                skeletonOnly={skeletonOnly}
                id="skin-motion-canvas"
                label="Motion pose preview"
                frame={sequenceFrame}
              />
            }
            onSelectFrame={(index) => {
              setPlaying(false);
              setFrame(index);
            }}
            onChange={changeMotion}
            onReset={() =>
              changeMotion(
                (project.motions.version === 2
                  ? createMotionLibraryV2()
                  : createMotionLibrary()
                ).clips[animation]!,
                `Reset ${animation} motion`,
              )
            }
          />
        </section>

        <aside className="skin-panel skin-bindings">
          <h2>4 · Adjust the binding</h2>
          <label>
            Joint chain
            <select
              aria-label="Joint chain"
              disabled={!!sourceLeg || !!sourceShoe}
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
            Drag the source-image handles, or enter coordinates here. Both limb
            pieces share the middle joint; a whole drag is one undo step.
            {(sourceLeg || sourceShoe) &&
              " Editing this alternative source leaves the anatomical chain unchanged."}
          </p>
          <div className="skin-joints">
            {joints.map((point, index) => (
              <div className="skin-joint" key={`${chain}-${index}`}>
                <strong>{jointLabels[index]}</strong>
                <NumberField
                  label={`${jointLabels[index]} X`}
                  value={point[0]}
                  min={sourceLeg || sourceShoe ? 1 : 0}
                  max={sourceLeg || sourceShoe ? 190 : 191}
                  onChange={(value) => moveJoint(index, 0, value)}
                />
                <NumberField
                  label={`${jointLabels[index]} Y`}
                  value={point[1]}
                  min={sourceLeg || sourceShoe ? 1 : 0}
                  max={sourceLeg || sourceShoe ? 254 : 255}
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
            after editing.{" "}
            {project.skin.metadata.version >= 3 &&
              "This resets base bindings; alternative source registration is preserved. Use Undo to restore an edited alternative."}
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
            bindings, wardrobe choices and preview settings. Imported identities
            and clothing are included too. <strong>CharacterPack</strong>{" "}
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
                return `CharacterPack exported with ${Object.keys(project.motions.clips).join(", ")} in the ${expression} expression. Load it in the independent player.`;
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
        ref={identityInput}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import identity ZIP file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file)
            void runTask("Importing identity…", async () => {
              const identity = await importWardrobeIdentity(file);
              const next = addWardrobeIdentity(project, identity);
              applyProject(next, "Import identity");
              return `${identity.name} added to your identities. The current artwork is unchanged. Choose Use identity or select it in Wardrobe, then save the project to keep it.`;
            });
        }}
      />
      <input
        hidden
        ref={clothingInput}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import clothing ZIP file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file)
            void runTask("Importing clothing…", async () => {
              const item = await importWardrobeItem(file);
              const next = addWardrobeItem(project, item);
              applyProject(
                next,
                "Import clothing item",
                structuredClone(next.skin.metadata.bindings),
              );
              return `${item.name} added and selected. Your identity, skeleton and motions are unchanged. Save the project to keep this item.`;
            });
        }}
      />
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
              applyProject(
                next,
                "Open project",
                structuredClone(next.skin.metadata.bindings),
              );
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
