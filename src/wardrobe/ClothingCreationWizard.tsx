import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { decodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import { downloadBlob } from "../core/pack";
import type { WardrobeProject } from "./contract";
import {
  AUTHORING_MAX_DRAFT_BYTES,
  AUTHORING_MAX_REFERENCE_BYTES,
  AUTHORING_MAX_REFERENCE_PIXELS,
  createGarmentAuthoringSession,
  openGarmentAuthoringDraft,
  type AuthoringReferenceInput,
  type GarmentAuthoringConfig,
  type GarmentAuthoringReport,
  type GarmentAuthoringSession,
} from "./garment-authoring";
import "./clothing-creation.css";

interface Props {
  project: WardrobeProject;
  onClose: () => void;
  onPreview: (
    bytes: Uint8Array,
    report: GarmentAuthoringReport,
  ) => Promise<void> | void;
}
type Step = 1 | 2 | 3 | 4;
type PoseImages = ReturnType<GarmentAuthoringSession["renderPose"]>;
const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const hex = (rgb: readonly number[]) =>
  `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
function rgb(value: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(value))
    throw Error("Use a six-digit color such as #128991.");
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
const validHex = (value: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function referenceImage(bytes: Uint8Array): RgbaPng {
  if (bytes.length < 45 || bytes.length > AUTHORING_MAX_REFERENCE_BYTES)
    throw Error("Choose a reference PNG up to 8 MiB.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
    header.getUint32(8) !== 13 ||
    header.getUint32(12) !== 0x49484452
  )
    throw Error("Choose an intact RGBA PNG reference.");
  const width = header.getUint32(16),
    height = header.getUint32(20);
  if (
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > AUTHORING_MAX_REFERENCE_PIXELS
  )
    throw Error(
      "Reference PNG must fit within 4096 pixels per side and 4 million pixels in total.",
    );
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[26] || bytes[27] || bytes[28])
    throw Error("Use a non-interlaced 8-bit RGBA PNG reference.");
  return decodeSourceRgbaPng(bytes, { width, height });
}

/** A new clothing color/material variation, with explicit output-bound pose
 * review. Original source, garment, ownership and current selection stay intact. */
export default function ClothingCreationWizard({
  project,
  onClose,
  onPreview,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const colorInputId = useId();
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);
  const referenceCanvas = useRef<HTMLCanvasElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const draftInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const current = useRef<GarmentAuthoringSession | null>(null);
  const worn = project.items.filter(
    (item) =>
      item.manifest.slot !== "shoes" &&
      Object.values(project.document.selection).includes(item.manifest.id),
  );
  const [baseId, setBaseId] = useState(worn[0]?.manifest.id ?? "");
  const [session, setSession] = useState<GarmentAuthoringSession | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    "Choose the clothing cut to keep for your new design.",
  );
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [sourceColor, setSourceColor] = useState("#128991");
  const [targetColor, setTargetColor] = useState("#c86450");
  const [tolerance, setTolerance] = useState("0.3");
  const [reference, setReference] = useState<AuthoringReferenceInput | null>(
    null,
  );
  const [referencePixels, setReferencePixels] = useState<RgbaPng | null>(null);
  const [report, setReport] = useState<GarmentAuthoringReport | null>(null);
  const [frameId, setFrameId] = useState(0);
  const [pictures, setPictures] = useState<PoseImages | null>(null);
  const [showAnchors, setShowAnchors] = useState(false);
  const [zoom, setZoom] = useState("fit");
  const [sampleX, setSampleX] = useState(0);
  const [sampleY, setSampleY] = useState(0);
  const [note, setNote] = useState("");
  const template = session?.template;
  const hardPoses = report?.hardPoses ?? [];
  const selectedReview = hardPoses.find((pose) => pose.frameId === frameId);
  const acceptedCount = hardPoses.filter(
    (pose) => pose.decision === "accepted",
  ).length;
  const rejectedCount = hardPoses.filter(
    (pose) => pose.decision === "rejected",
  ).length;
  const reviewedAll =
    hardPoses.length > 0 && acceptedCount === hardPoses.length;

  useEffect(() => {
    alive.current = true;
    const restoreFocus = document.activeElement;
    const target = dialog.current;
    target?.showModal();
    return () => {
      alive.current = false;
      sequence.current++;
      operation.current?.abort();
      lifetime.current?.abort();
      current.current?.dispose();
      current.current = null;
      target?.close();
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected)
        restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    const heading = dialog.current?.querySelector<HTMLElement>(
      ".clothing-creation-step h3",
    );
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [step]);

  function begin(message: string) {
    const token = ++sequence.current;
    operation.current?.abort();
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    setError("");
    setNotice(message);
    return { token, abort };
  }
  function active(token: number, abort: AbortController) {
    return alive.current && sequence.current === token && !abort.signal.aborted;
  }
  function finish(token: number) {
    if (alive.current && sequence.current === token) {
      operation.current = null;
      setBusy(false);
    }
  }
  function cancel() {
    sequence.current++;
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setNotice("Preparation cancelled. Your current outfit is unchanged.");
  }
  function adopt(next: GarmentAuthoringSession, abort: AbortController) {
    lifetime.current?.abort();
    current.current?.dispose();
    lifetime.current = abort;
    current.current = next;
    setSession(next);
  }

  function showPose(id: number, from = session) {
    if (!from) return;
    try {
      const next = from.renderPose(id);
      setFrameId(id);
      setPictures(next);
      setNote(
        from.getReport()?.hardPoses.find((pose) => pose.frameId === id)?.note ??
          "",
      );
      setError("");
    } catch (cause) {
      setPictures(null);
      setError(describe(cause));
    }
  }

  async function chooseTemplate() {
    if (!baseId || busy) return;
    if (session && baseId === session.template.id) {
      setStep(2);
      showPose(frameId);
      setNotice("Continue this design using its saved starting clothing.");
      return;
    }
    const { token, abort } = begin(
      "Checking the starting clothing and its source poses…",
    );
    let created: GarmentAuthoringSession | null = null;
    try {
      created = await createGarmentAuthoringSession(project, baseId, {
        signal: abort.signal,
      });
      if (!active(token, abort)) {
        created.dispose();
        return;
      }
      const initial = created.template.hardPoses[0];
      if (!initial) throw Error("This clothing has no source poses to review.");
      // Render before adopting the session so a failed template keeps the old draft.
      const initialPictures = created.renderPose(initial.frameId);
      adopt(created, abort);
      setId(
        `${created.template.id.slice(0, 36)}-design-${Date.now().toString(36)}`,
      );
      setName(`${created.template.name} variation`.slice(0, 120));
      setReport(null);
      setReference(null);
      setReferencePixels(null);
      setFrameId(initial.frameId);
      setPictures(initialPictures);
      setNote("");
      setStep(2);
      setNotice(
        "Sample the original cloth and choose its new color. The existing cut and drawing stay in place.",
      );
    } catch (cause) {
      if (created && created !== current.current) created.dispose();
      if (active(token, abort)) setError(describe(cause));
    } finally {
      finish(token);
    }
  }

  function invalidate() {
    if (!session || busy) return;
    session.invalidate();
    setReport(null);
    setStep(2);
    setNote("");
    setNotice("Design changed. Build it again, then review the new output.");
    showPose(frameId);
  }

  function sampleCloth(x: number, y: number) {
    if (!session || busy || step !== 2) return;
    try {
      const sampled = session.sampleCloth(frameId, x, y);
      invalidate();
      setSourceColor(hex(sampled));
      setSampleX(x);
      setSampleY(y);
      setNotice(`Original cloth color sampled at ${x}, ${y}.`);
      setError("");
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function sampleFromCanvas(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (step !== 2 || busy || !template || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    sampleCloth(
      clamp(
        Math.floor(((event.clientX - rect.left) / rect.width) * template.width),
        0,
        template.width - 1,
      ),
      clamp(
        Math.floor(
          ((event.clientY - rect.top) / rect.height) * template.height,
        ),
        0,
        template.height - 1,
      ),
    );
  }

  async function chooseReference(file?: File) {
    if (!file || !session || busy) return;
    const { token, abort } = begin("Checking the local reference PNG…");
    try {
      if (file.size > AUTHORING_MAX_REFERENCE_BYTES)
        throw Error("Choose a reference PNG up to 8 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!active(token, abort)) return;
      const pixels = referenceImage(bytes);
      if (!active(token, abort)) return;
      session.invalidate();
      setReport(null);
      setStep(2);
      setReference({ name: file.name, bytes });
      setReferencePixels(pixels);
      showPose(frameId);
      setNotice(
        "Reference loaded locally. Click a visible color to use it as the new cloth color.",
      );
    } catch (cause) {
      if (active(token, abort))
        setError(
          `${describe(cause)} The previous reference and draft have been kept.`,
        );
    } finally {
      finish(token);
    }
  }

  function sampleReference(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!referencePixels || busy || step !== 2 || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp(
      Math.floor(
        ((event.clientX - bounds.left) / bounds.width) * referencePixels.width,
      ),
      0,
      referencePixels.width - 1,
    );
    const y = clamp(
      Math.floor(
        ((event.clientY - bounds.top) / bounds.height) * referencePixels.height,
      ),
      0,
      referencePixels.height - 1,
    );
    const at = (y * referencePixels.width + x) * 4;
    if (!referencePixels.pixels[at + 3]) {
      setError("Choose a visible color in the reference.");
      return;
    }
    invalidate();
    setTargetColor(hex(Array.from(referencePixels.pixels.slice(at, at + 3))));
    setNotice(`New cloth color sampled from the reference at ${x}, ${y}.`);
  }

  useLayoutEffect(() => {
    const target = referenceCanvas.current;
    if (!target || !referencePixels) return;
    target.width = referencePixels.width;
    target.height = referencePixels.height;
    target
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(referencePixels.pixels),
          target.width,
          target.height,
        ),
        0,
        0,
      );
  }, [referencePixels, step]);

  useLayoutEffect(() => {
    for (const [index, target] of [
      beforeCanvas.current,
      afterCanvas.current,
    ].entries()) {
      if (!target) continue;
      if (!pictures || !template) {
        target.width = 1;
        target.height = 1;
        delete target.dataset.frameId;
        continue;
      }
      const image = index === 0 ? pictures.before : pictures.after;
      target.width = image.width;
      target.height = image.height;
      const context = target.getContext("2d")!;
      context.putImageData(
        new ImageData(
          new Uint8ClampedArray(image.pixels),
          image.width,
          image.height,
        ),
        0,
        0,
      );
      if (showAnchors) {
        context.font = "12px sans-serif";
        for (const [name, point] of Object.entries(pictures.anchors)) {
          context.fillStyle =
            point.visibility === "visible" ? "#f7f5e9" : "#ffc66e";
          context.strokeStyle = "#3e5146";
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(point.x, point.y, 4, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          if (
            [
              "neck",
              "nearShoulder",
              "farShoulder",
              "waistLeft",
              "waistRight",
            ].includes(name)
          ) {
            context.strokeStyle = "#263e34";
            context.lineWidth = 3;
            context.strokeText(name, point.x + 7, point.y - 5);
            context.fillText(name, point.x + 7, point.y - 5);
          }
        }
      }
      target.dataset.frameId = String(frameId);
      target.dataset.nativeWidth = String(image.width);
      target.dataset.nativeHeight = String(image.height);
      target.dataset.cropX = "0";
      target.dataset.cropY = "0";
      target.dataset.facing = "right";
    }
  }, [pictures, template?.id, frameId, showAnchors, step]);

  async function build() {
    if (!session || busy) return;
    let configuration: GarmentAuthoringConfig;
    try {
      configuration = {
        id,
        name,
        material: {
          sourceRgb: rgb(sourceColor),
          targetRgb: rgb(targetColor),
          tolerance: Number(tolerance),
        },
      };
    } catch (cause) {
      setError(describe(cause));
      return;
    }
    const { token, abort } = begin("Building every registered clothing pose…");
    setReport(null);
    try {
      const result = await session.build(
        configuration,
        reference ?? undefined,
        {
          signal: abort.signal,
          onProgress: (done, total) => {
            if (active(token, abort))
              setNotice(`Building and checking clothing: ${done} / ${total}…`);
          },
        },
      );
      if (!active(token, abort)) return;
      setReport(result.report);
      setStep(3);
      showPose(result.report.hardPoses[0].frameId);
      setNotice(
        `All ${result.report.poses.length} source poses built. Inspect each of the ${result.report.hardPoses.length} review poses before continuing.`,
      );
    } catch (cause) {
      if (active(token, abort))
        setError(`${describe(cause)} Your current outfit is unchanged.`);
    } finally {
      finish(token);
    }
  }

  function decide(decision: "accepted" | "rejected" | "pending") {
    if (!session || !report || busy) return;
    try {
      const next = session.reviewPose(frameId, decision, note);
      setReport(next);
      setNotice(
        `Pose ${frameId} marked ${decision}. These decisions belong only to this built artwork.`,
      );
      setError("");
    } catch (cause) {
      setError(describe(cause));
    }
  }

  async function saveDraft() {
    if (!session || !report || busy) return;
    const { token, abort } = begin("Packing the editable clothing draft…");
    try {
      const bytes = await session.saveDraft({ signal: abort.signal });
      if (!active(token, abort)) return;
      downloadBlob(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
        `${report.output.id}.authoring.zip`,
      );
      setNotice(
        "Authoring draft downloaded with the exact starting clothing, reference, design and review decisions.",
      );
    } catch (cause) {
      if (active(token, abort)) setError(describe(cause));
    } finally {
      finish(token);
    }
  }

  async function openDraft(file?: File) {
    if (!file || busy) return;
    const { token, abort } = begin(
      "Rebuilding and checking the saved clothing draft…",
    );
    let opened: GarmentAuthoringSession | null = null;
    try {
      if (file.size > AUTHORING_MAX_DRAFT_BYTES)
        throw Error("Choose a clothing authoring draft up to 80 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!active(token, abort)) return;
      opened = await openGarmentAuthoringDraft(project, bytes, {
        signal: abort.signal,
        onProgress: (done, total) => {
          if (active(token, abort))
            setNotice(`Checking saved clothing: ${done} / ${total}…`);
        },
      });
      if (!active(token, abort)) {
        opened.dispose();
        return;
      }
      const config = opened.configuration,
        savedReport = opened.getReport(),
        savedReference = opened.reference;
      if (!config || !savedReport || !savedReport.hardPoses.length)
        throw Error(
          "The saved draft has no complete built clothing to review.",
        );
      const refImage = savedReference
        ? referenceImage(savedReference.bytes)
        : null;
      const first = opened.renderPose(savedReport.hardPoses[0].frameId);
      adopt(opened, abort);
      setBaseId(opened.template.id);
      setId(config.id);
      setName(config.name);
      setSourceColor(hex(config.material.sourceRgb));
      setTargetColor(hex(config.material.targetRgb));
      setTolerance(String(config.material.tolerance));
      setReference(
        savedReference
          ? { name: savedReference.name, bytes: savedReference.bytes }
          : null,
      );
      setReferencePixels(refImage);
      setReport(savedReport);
      setFrameId(savedReport.hardPoses[0].frameId);
      setPictures(first);
      setNote(savedReport.hardPoses[0].note);
      setStep(3);
      setNotice(
        "Draft reopened with its exact starting clothing and verified output. Your currently worn outfit stays unchanged.",
      );
    } catch (cause) {
      if (opened && opened !== current.current) opened.dispose();
      if (active(token, abort))
        setError(
          `${describe(cause)} The previous draft and current outfit have been kept.`,
        );
    } finally {
      finish(token);
    }
  }

  async function preview() {
    if (!session || busy || !reviewedAll) return;
    try {
      const bytes = session.getOutputBytes(),
        verifiedReport = session.getReport();
      if (
        !bytes ||
        !verifiedReport ||
        verifiedReport.hardPoses.some((pose) => pose.decision !== "accepted")
      )
        throw Error(
          "Build and accept every review pose before previewing this clothing.",
        );
      setBusy(true);
      setError("");
      setNotice("Opening the complete outfit preview…");
      await onPreview(bytes, verifiedReport);
    } catch (cause) {
      if (alive.current) setError(describe(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const canvasStyle = {
    width:
      zoom === "fit" ? "100%" : `${(template?.width ?? 1) * Number(zoom)}px`,
    maxWidth: zoom === "fit" ? "100%" : "none",
  };
  const posePanel = template && pictures && (
    <>
      <div className="clothing-creation-view-controls">
        <label>
          Review pose
          <select
            value={frameId}
            disabled={busy}
            onChange={(event) => showPose(Number(event.target.value))}
          >
            {(report?.hardPoses ?? template.hardPoses).map((pose) => (
              <option key={pose.frameId} value={pose.frameId}>
                {pose.action} · pose {pose.frameId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Detail scale
          <select
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
          >
            <option value="fit">Fit panels</option>
            <option value="1">Native 1×</option>
            <option value="2">Integer 2×</option>
          </select>
        </label>
        <label className="clothing-creation-check">
          <input
            type="checkbox"
            checked={showAnchors}
            onChange={(event) => setShowAnchors(event.target.checked)}
          />{" "}
          Show anchor guide
        </label>
      </div>
      <div className="clothing-creation-panels">
        <figure>
          <figcaption>
            Starting clothing
            {step === 2 ? " · click cloth to sample its color" : ""}
          </figcaption>
          <div className="clothing-creation-canvas-scroll">
            <canvas
              ref={beforeCanvas}
              style={canvasStyle}
              data-testid="authoring-before-canvas"
              aria-label="Starting clothing native preview"
              onPointerDown={sampleFromCanvas}
            />
          </div>
        </figure>
        <figure>
          <figcaption>
            {report ? "New clothing" : "Same cut before building"}
          </figcaption>
          <div className="clothing-creation-canvas-scroll">
            <canvas
              ref={afterCanvas}
              style={canvasStyle}
              data-testid="authoring-after-canvas"
              aria-label="New clothing native preview"
            />
          </div>
        </figure>
      </div>
      <p className="clothing-creation-help">
        Native right-facing source with this clothing only. Hair and the full
        mixed outfit are checked in the final candidate preview. Changing these
        view controls never changes exported pixels.
      </p>
    </>
  );

  return (
    <dialog
      ref={dialog}
      className="clothing-creation-wizard"
      aria-label="Clothing creation wizard"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="clothing-creation-header">
        <div>
          <h2>Create clothing</h2>
          <p>
            Make a reviewed color or material variation of an existing clothing
            cut.
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close clothing creation
        </button>
      </header>
      <ol className="clothing-creation-steps" aria-label="Creation steps">
        {["Starting clothing", "Design", "Pose review", "Preview"].map(
          (label, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <div className="clothing-creation-draft-toolbar">
        <button
          type="button"
          disabled={busy}
          onClick={() => draftInput.current?.click()}
        >
          Open authoring draft
        </button>
        <button
          type="button"
          disabled={busy || !report}
          onClick={() => void saveDraft()}
        >
          Save authoring draft
        </button>
        <input
          ref={draftInput}
          type="file"
          accept=".zip"
          hidden
          aria-label="Clothing authoring draft file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void openDraft(file);
          }}
        />
      </div>
      {step === 1 && (
        <section className="clothing-creation-step">
          <h3>1. Keep a proven cut</h3>
          <p>
            Choose a currently worn top, bottom or dress. The new material
            follows that clothing's existing poses, seams and silhouette.
          </p>
          {worn.length ? (
            <label>
              Starting clothing
              <select
                value={baseId}
                disabled={busy}
                onChange={(event) => setBaseId(event.target.value)}
              >
                {!worn.some((item) => item.manifest.id === baseId) &&
                  template && (
                    <option value={template.id}>
                      {template.name} · saved draft base
                    </option>
                  )}
                {worn.map((item) => (
                  <option key={item.manifest.id} value={item.manifest.id}>
                    {item.manifest.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              Choose a top, bottom or dress in the wardrobe first, or open an
              existing authoring draft.
            </p>
          )}
          <p className="clothing-creation-scope">
            This workflow changes painted material colors. New sleeve lengths,
            garment shapes and hidden surfaces need separately authored artwork.
            A reference image supplies color context; it is not fitted onto the
            character.
          </p>
          <button
            className="clothing-creation-primary"
            type="button"
            disabled={busy || !baseId}
            onClick={() => void chooseTemplate()}
          >
            Continue to design
          </button>
        </section>
      )}
      {step === 2 && template && (
        <section className="clothing-creation-step">
          <h3>2. Design the material</h3>
          <p>
            Starting from <strong>{template.name}</strong>. Give this design a
            new identity so the original remains available.
          </p>
          <div className="clothing-creation-form">
            <label>
              New clothing ID
              <input
                value={id}
                maxLength={64}
                disabled={busy}
                onChange={(event) => {
                  invalidate();
                  setId(event.target.value);
                }}
              />
            </label>
            <label>
              New clothing name
              <input
                value={name}
                maxLength={120}
                disabled={busy}
                onChange={(event) => {
                  invalidate();
                  setName(event.target.value);
                }}
              />
            </label>
            <div>
              <label htmlFor={`${colorInputId}-source`}>
                Original cloth color
              </label>
              <div className="clothing-creation-color">
                <input
                  id={`${colorInputId}-source`}
                  type="text"
                  value={sourceColor}
                  maxLength={7}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setSourceColor(event.target.value);
                  }}
                />
                <input
                  aria-label="Original cloth color swatch"
                  type="color"
                  value={validHex(sourceColor, "#128991")}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setSourceColor(event.target.value);
                  }}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${colorInputId}-target`}>New cloth color</label>
              <div className="clothing-creation-color">
                <input
                  id={`${colorInputId}-target`}
                  type="text"
                  value={targetColor}
                  maxLength={7}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setTargetColor(event.target.value);
                  }}
                />
                <input
                  aria-label="New cloth color swatch"
                  type="color"
                  value={validHex(targetColor, "#c86450")}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setTargetColor(event.target.value);
                  }}
                />
              </div>
            </div>
            <label>
              Color tolerance
              <input
                type="number"
                min={0.02}
                max={0.5}
                step={0.01}
                value={tolerance}
                disabled={busy}
                onChange={(event) => {
                  invalidate();
                  setTolerance(event.target.value);
                }}
              />
            </label>
          </div>
          <p className="clothing-creation-help">
            A lower tolerance selects a narrower material color family. A higher
            value may also affect trim or buttons. Lighting and folds follow the
            existing drawing; inspect every suggested review pose.
          </p>
          {posePanel}
          <div className="clothing-creation-sampling">
            <label>
              Cloth sample X
              <input
                type="number"
                min={0}
                max={template.width - 1}
                value={sampleX}
                disabled={busy}
                onChange={(event) =>
                  setSampleX(
                    clamp(
                      Math.floor(Number(event.target.value) || 0),
                      0,
                      template.width - 1,
                    ),
                  )
                }
              />
            </label>
            <label>
              Cloth sample Y
              <input
                type="number"
                min={0}
                max={template.height - 1}
                value={sampleY}
                disabled={busy}
                onChange={(event) =>
                  setSampleY(
                    clamp(
                      Math.floor(Number(event.target.value) || 0),
                      0,
                      template.height - 1,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => sampleCloth(sampleX, sampleY)}
            >
              Use cloth sample
            </button>
          </div>
          <section className="clothing-creation-reference">
            <h4>Optional color reference</h4>
            <button
              type="button"
              disabled={busy}
              onClick={() => referenceInput.current?.click()}
            >
              Choose reference PNG
            </button>
            <input
              ref={referenceInput}
              type="file"
              accept=".png,image/png"
              hidden
              aria-label="Clothing reference PNG"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void chooseReference(file);
              }}
            />
            {reference && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  invalidate();
                  setReference(null);
                  setReferencePixels(null);
                }}
              >
                Remove reference
              </button>
            )}
            {reference && referencePixels && (
              <figure>
                <figcaption>
                  {reference.name} · click a visible color to use it
                </figcaption>
                <div className="clothing-creation-reference-scroll">
                  <canvas
                    ref={referenceCanvas}
                    aria-label="Local clothing color reference"
                    data-testid="authoring-reference-canvas"
                    onPointerDown={sampleReference}
                  />
                </div>
              </figure>
            )}
            <p className="clothing-creation-help">
              Reference pixels are not pasted onto the character. The local PNG
              is retained with the saved authoring draft. Static 8-bit RGBA PNG,
              up to 8 MiB and 4 million pixels.
            </p>
          </section>
          <div className="clothing-creation-actions">
            <button type="button" disabled={busy} onClick={() => setStep(1)}>
              Back to starting clothing
            </button>
            <button
              className="clothing-creation-primary"
              type="button"
              disabled={busy || !id.trim() || !name.trim()}
              onClick={() => void build()}
            >
              Build clothing variant
            </button>
          </div>
        </section>
      )}
      {step === 3 && template && report && (
        <section className="clothing-creation-step">
          <h3>3. Review difficult poses</h3>
          <p>
            <strong>
              {acceptedCount} / {hardPoses.length} accepted
            </strong>{" "}
            · {rejectedCount} rejected. These are selected pose checks, not a
            claim that every animation has been visually approved.
          </p>
          <p>
            {report.poses.length} source drawings were built;{" "}
            {report.changedAtlasPixels.toLocaleString()} clothing pixels
            changed. Ownership, transparency, anchors and timing remain those of
            the starting clothing.
          </p>
          {posePanel}
          {selectedReview && (
            <section className="clothing-creation-pose-decision">
              <p data-testid="authoring-pose-status">
                <strong>
                  Pose {frameId}: {selectedReview.decision}
                </strong>{" "}
                · {selectedReview.action} position {selectedReview.position + 1}
              </p>
              <ul>
                {selectedReview.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <label>
                Pose review note
                <textarea
                  value={note}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(event) => {
                    const nextNote = event.target.value;
                    try {
                      if (!session) return;
                      setReport(
                        session.reviewPose(
                          frameId,
                          selectedReview.decision,
                          nextNote,
                        ),
                      );
                      setNote(nextNote);
                    } catch (cause) {
                      setError(describe(cause));
                    }
                  }}
                  placeholder="Record a seam, color spill or area you checked."
                />
              </label>
              <div className="clothing-creation-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide("accepted")}
                >
                  Accept pose
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide("rejected")}
                >
                  Reject pose
                </button>
                <button
                  type="button"
                  disabled={busy || selectedReview.decision === "pending"}
                  onClick={() => decide("pending")}
                >
                  Return to review
                </button>
              </div>
            </section>
          )}
          <div
            className="clothing-creation-review-queue"
            aria-label="Authoring review queue"
          >
            {hardPoses.map((pose) => (
              <button
                key={pose.frameId}
                type="button"
                disabled={busy}
                aria-current={pose.frameId === frameId ? "true" : undefined}
                onClick={() => showPose(pose.frameId)}
              >
                Pose {pose.frameId} · {pose.decision}
              </button>
            ))}
          </div>
          <p className="clothing-creation-help">
            If a pose is wrong, reject it and revise the material settings.
            Painting and mask tools remain available for local corrections after
            an explicitly applied candidate. Changing the design requires a new
            review.
          </p>
          <div className="clothing-creation-actions">
            <button type="button" disabled={busy} onClick={() => setStep(2)}>
              Back to design
            </button>
            <button
              className="clothing-creation-primary"
              type="button"
              disabled={busy || !reviewedAll}
              onClick={() => setStep(4)}
            >
              Continue to preview
            </button>
          </div>
        </section>
      )}
      {step === 4 && report && (
        <section className="clothing-creation-step">
          <h3>4. Preview the complete outfit</h3>
          <p>
            <strong>{report.output.name}</strong> is a separate clothing item.
            All {hardPoses.length} selected review poses have been accepted for
            this exact output.
          </p>
          <p className="clothing-creation-output-hash">
            Output: <code>{report.output.sha256}</code>
          </p>
          <p>
            The next preview combines the new clothing with the current
            wardrobe, hair and face. Check playback in both directions, then
            explicitly apply or discard it. You can download the new garment and
            its report there.
          </p>
          <p>
            Save the authoring draft to keep the starting material, color
            settings, optional reference and review decisions for later changes.
          </p>
          <div className="clothing-creation-actions">
            <button type="button" disabled={busy} onClick={() => setStep(3)}>
              Back to review
            </button>
            <button type="button" disabled={busy} onClick={() => setStep(2)}>
              Back to design
            </button>
            <button
              className="clothing-creation-primary"
              type="button"
              disabled={busy || !reviewedAll}
              onClick={() => void preview()}
            >
              Preview new clothing
            </button>
          </div>
        </section>
      )}
      <footer className="clothing-creation-footer">
        <p role="status" aria-live="polite" data-testid="authoring-status">
          {notice}
        </p>
        {busy && operation.current && (
          <button type="button" onClick={cancel}>
            Cancel preparation
          </button>
        )}
        {error && (
          <p role="alert" className="clothing-creation-error">
            {error}
          </p>
        )}
      </footer>
    </dialog>
  );
}
