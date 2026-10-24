import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  characterPackImages,
  downloadBlob,
  loadPortableCharacterPack,
  releaseCharacterImages,
  safeFilename,
  type LoadedCharacterPack,
} from "../core/pack";
import { assertSourcePreparationActive } from "../core/source-preparation";
import type { Facing, PortableAnimationName } from "../core/types";
import { drawCharacterFrame, imageForFrame } from "../consumer/player";
import type { KlingCharacterId } from "../consumer/kling-catalog";
import { THEME_CATALOG } from "./catalog";
import { readThemeBundle } from "./bundle";
import {
  THEME_ACTIONS,
  THEME_MAX_BYTES,
  THEME_SESSION_MAX_BYTES,
} from "./contract";
import {
  addTheme,
  createThemeSession,
  exportSelectedThemePack,
  exportThemeSession,
  getSelectedTheme,
  getSelectedThemeLook,
  readThemeSession,
  selectTheme,
  selectThemeLook,
  selectThemePlayback,
  type ThemeSession,
} from "./session";
import { themeActionGif, themeFramePng } from "./media";
import { transferThemeMotion } from "./motion-phase";
import { themePreviewCanvasAvailable } from "./preview-budget";
import { assertPublishedThemeIdentity } from "./published";
import {
  createThemeComparisonPlanes,
  type ComparisonPlane,
} from "./comparison";
import "./themes.css";

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const release = (pack: LoadedCharacterPack | null) => {
  if (pack) releaseCharacterImages(characterPackImages(pack));
};
const saveBytes = (bytes: Uint8Array, name: string, type = "application/zip") =>
  downloadBlob(new Blob([new Uint8Array(bytes)], { type }), name);

interface MotionSnapshot {
  session: ThemeSession | null;
  position: number;
  playing: boolean;
  preserve: boolean;
}

/** Preview uses native pixels; display zoom never changes exported artwork. */
function ThemeCanvas({
  pack,
  frameId,
  facing,
  zoom,
  label,
  testId,
  plane,
}: {
  pack: LoadedCharacterPack;
  frameId: number;
  facing: Facing;
  zoom: "fit" | number;
  label: string;
  testId: string;
  plane?: ComparisonPlane;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(520);
  const { manifest } = pack;
  const frame = manifest.frames.find((value) => value.id === frameId)!;
  const pixel = manifest.scale.pixelArt;
  const width = plane?.width ?? frame.width,
    height = plane?.height ?? frame.height;
  const previewAvailable = themePreviewCanvasAvailable(width, height);
  const fit = Math.min(1, availableWidth / width, 590 / height);
  const scale =
    zoom === "fit"
      ? (plane?.integerDisplay ?? pixel)
        ? Math.max(1, Math.floor(fit))
        : fit
      : zoom;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setAvailableWidth(element.clientWidth),
    );
    observer.observe(element);
    setAvailableWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const target = canvas.current;
    if (!target || !frame || !previewAvailable) return;
    target.width = width;
    target.height = height;
    const context = target.getContext("2d")!;
    context.clearRect(0, 0, target.width, target.height);
    drawCharacterFrame(
      context,
      imageForFrame(pack, frame),
      manifest,
      frame,
      facing,
      plane?.sourceScale ?? 1,
      plane?.anchor ?? {
        x:
          facing === "left"
            ? frame.width - manifest.anchor.x
            : manifest.anchor.x,
        y: manifest.anchor.y,
      },
    );
  }, [pack, frame, manifest, facing, width, height, plane, previewAvailable]);
  return (
    <div className="theme-canvas-wrap" ref={container}>
      {previewAvailable ? (
        <canvas
          ref={canvas}
          aria-label={label}
          data-testid={testId}
          data-frame-id={frameId}
          data-facing={facing}
          data-sampling={pixel ? "nearest" : "smooth"}
          style={{
            width: width * scale,
            height: height * scale,
            imageRendering: pixel ? "pixelated" : "auto",
          }}
        />
      ) : (
        <p role="note" className="theme-preview-unavailable">
          This {width} × {height} drawing exceeds the preview canvas budget. Its
          native PNG and CharacterPack remain available to export; the artwork
          has not been resized.
        </p>
      )}
    </div>
  );
}

export default function ThemeWorkspace({
  initialCharacter = "male",
  active = true,
  onCharacterChange,
}: {
  initialCharacter?: KlingCharacterId;
  active?: boolean;
  onCharacterChange?: (character: KlingCharacterId) => void;
}) {
  const [session, setSession] = useState<ThemeSession | null>(null);
  const currentSession = useRef<ThemeSession | null>(null);
  const [character, setCharacter] =
    useState<KlingCharacterId>(initialCharacter);
  const [loaded, setLoaded] = useState<{
    hash: string;
    pack: LoadedCharacterPack;
  } | null>(null);
  const [reference, setReference] = useState<{
    character: KlingCharacterId;
    sourceSha256: string;
    lookId: string;
    name: string;
    pack: LoadedCharacterPack;
  } | null>(null);
  const [compare, setCompare] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [referenceMissing, setReferenceMissing] = useState(false);
  const [keepMotionPhase, setKeepMotionPhase] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Choose a theme to begin.");
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const themeInput = useRef<HTMLInputElement>(null);
  const sessionInput = useRef<HTMLInputElement>(null);
  const currentPosition = useRef(0);
  const currentPlaying = useRef(false);
  currentSession.current = session;
  currentPosition.current = position;
  currentPlaying.current = playing;

  const theme = session ? getSelectedTheme(session) : null;
  const look = session ? getSelectedThemeLook(session) : null;
  const pack = loaded && loaded.hash === look?.sha256 ? loaded.pack : null;
  const action = session?.selection.action ?? "idle";
  const facing = session?.selection.facing ?? "right";
  const clip = pack?.manifest.animations[action];
  const safePosition = clip ? Math.min(position, clip.frames.length - 1) : 0;
  const frameId = clip?.frames[safePosition];
  const requestedLookId = session?.selection.lookId;
  const originalEntry = THEME_CATALOG.find(
    (entry) => entry.character === character && entry.isOriginal,
  );
  const items = [
    ...THEME_CATALOG.filter((entry) => entry.character === character).map(
      (entry) => ({
        key: entry.key,
        name: entry.name,
        description: entry.description,
        previewUrl: entry.previewUrl,
      }),
    ),
    ...(session?.themes ?? [])
      .filter(
        (candidate) =>
          candidate.manifest.character === character &&
          !THEME_CATALOG.some((entry) => entry.key === candidate.key),
      )
      .map((candidate) => ({
        key: candidate.key,
        name: candidate.manifest.name,
        description: `Imported · revision ${candidate.manifest.revision} · ${candidate.manifest.rendering}`,
        previewUrl: undefined,
      })),
  ];

  useEffect(() => () => release(loaded?.pack ?? null), [loaded]);
  useEffect(() => () => release(reference?.pack ?? null), [reference]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!active) {
      operation.current?.abort();
      setPlaying(false);
    }
  }, [active]);

  async function run(
    label: string,
    job: (signal: AbortSignal) => Promise<void>,
  ) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label);
    setError("");
    try {
      await job(controller.signal);
    } catch (cause) {
      if (operation.current === controller && alive.current) {
        if (controller.signal.aborted)
          setMessage("Preparation canceled. Your accepted theme is unchanged.");
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "The theme could not be prepared.",
          );
      }
    } finally {
      if (operation.current === controller && alive.current) {
        operation.current = null;
        setBusy("");
      }
    }
  }

  async function commit(
    next: ThemeSession,
    signal: AbortSignal,
    status: string,
    motion?: MotionSnapshot,
  ) {
    // Includes themes not currently selected or previously loaded: an imported
    // session must not reserve a published key with unrelated artwork.
    for (const candidate of next.themes)
      assertPublishedThemeIdentity(candidate, THEME_CATALOG);
    const nextLook = getSelectedThemeLook(next);
    let nextPack: LoadedCharacterPack | null = null;
    try {
      if (nextLook)
        nextPack = await loadPortableCharacterPack(
          new Blob([new Uint8Array(nextLook.bytes)]),
        );
      assertSourcePreparationActive({ signal });
      if (!alive.current)
        throw new DOMException("Workspace closed", "AbortError");
    } catch (cause) {
      release(nextPack);
      throw cause;
    }
    const nextTheme = getSelectedTheme(next);
    const previous = motion?.session;
    const previousTheme = previous ? getSelectedTheme(previous) : null;
    const sameCharacter =
      previousTheme?.manifest.character === nextTheme.manifest.character &&
      previousTheme?.manifest.reference.sourceSha256 ===
        nextTheme.manifest.reference.sourceSha256;
    const previousLook = previous ? getSelectedThemeLook(previous) : null;
    const nextClip = nextPack?.manifest.animations[next.selection.action];
    const transfer = transferThemeMotion(
      previous
        ? previousLook?.archive.manifest.animations[previous.selection.action]
        : undefined,
      nextClip,
      motion?.position ?? 0,
      motion?.playing ?? false,
      !!motion?.preserve &&
        !!previous &&
        sameCharacter &&
        previous.selection.action === next.selection.action,
    );
    currentSession.current = next;
    currentPosition.current = transfer.position;
    currentPlaying.current = transfer.playing;
    setSession(next);
    setCharacter(nextTheme.manifest.character);
    onCharacterChange?.(nextTheme.manifest.character);
    setLoaded(
      nextPack && nextLook ? { hash: nextLook.sha256, pack: nextPack } : null,
    );
    // React batches this with the new pack; the canvas draws in a layout effect
    // so the first visible image is the mapped pose, never a flash of pose zero.
    setPosition(transfer.position);
    setPlaying(transfer.playing);
    // Keep an explicitly chosen viewing zoom while changing this character's
    // art/look. Restore, reopening and another character start with a safe fit.
    if (!motion || !previous || !sameCharacter) setZoom("fit");
    setMessage(
      status +
        (motion && nextClip
          ? transfer.preserved
            ? ` Motion phase retained; playback ${transfer.playing ? "continues" : "is paused"}.`
            : " Action starts at its first frame, paused."
          : ""),
    );
  }

  function snapshotMotion(): MotionSnapshot {
    return {
      session: currentSession.current,
      position: currentPosition.current,
      playing: currentPlaying.current,
      preserve: keepMotionPhase,
    };
  }

  async function openTheme(key: string, reset = false) {
    const motion = reset ? undefined : snapshotMotion();
    await run("Opening theme…", async (signal) => {
      const previous = currentSession.current;
      let bundle = previous?.themes.find((candidate) => candidate.key === key);
      if (!bundle) {
        const entry = THEME_CATALOG.find((candidate) => candidate.key === key);
        if (!entry)
          throw Error(
            "This theme is not available in the catalog or saved session.",
          );
        bundle = await entry.load({ signal });
      }
      assertSourcePreparationActive({ signal });
      assertPublishedThemeIdentity(bundle, THEME_CATALOG);
      const combined = previous
        ? addTheme(previous, bundle)
        : createThemeSession([bundle]);
      let next = selectTheme(combined, key);
      if (reset)
        next = createThemeSession(next.themes, {
          themeKey: key,
          lookId: bundle.looks[0].logicalId,
          action: "idle",
          facing: previous?.selection.facing ?? "right",
        });
      await commit(
        next,
        signal,
        `${bundle.manifest.name} selected.${getSelectedThemeLook(next) ? (reset ? " Action starts at its first frame." : "") : " Choose a matching look; the requested outfit is unavailable."}`,
        motion,
      );
    });
  }

  async function openLook(lookId: string) {
    const previous = currentSession.current;
    if (!previous) return;
    const motion = snapshotMotion();
    await run("Opening look…", (signal) =>
      commit(
        selectThemeLook(previous, lookId),
        signal,
        "Look selected.",
        motion,
      ),
    );
  }

  useEffect(() => {
    if (
      !active ||
      currentSession.current ||
      (operation.current && !operation.current.signal.aborted)
    )
      return;
    const entry = THEME_CATALOG.find(
      (candidate) =>
        candidate.character === initialCharacter && candidate.isOriginal,
    );
    if (entry) void openTheme(entry.key, true);
    // First opening only; accepted session survives later tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, initialCharacter]);

  useEffect(() => {
    if (!compare || !active || !originalEntry) {
      setReference(null);
      return;
    }
    const controller = new AbortController();
    let prepared: LoadedCharacterPack | null = null;
    setReferenceError("");
    setReferenceMissing(false);
    void (async () => {
      try {
        const bundle =
          currentSession.current?.themes.find(
            (candidate) => candidate.key === originalEntry.key,
          ) ?? (await originalEntry.load({ signal: controller.signal }));
        assertPublishedThemeIdentity(bundle, THEME_CATALOG);
        if (
          bundle.manifest.reference.sourceSha256 !==
          theme?.manifest.reference.sourceSha256
        ) {
          assertSourcePreparationActive({ signal: controller.signal });
          setReference(null);
          setReferenceError(
            "This theme references a different original source. No unrelated reference is substituted.",
          );
          return;
        }
        const referenceLook = bundle.looks.find(
          (candidate) => candidate.logicalId === requestedLookId,
        );
        if (!referenceLook) {
          assertSourcePreparationActive({ signal: controller.signal });
          setReference(null);
          setReferenceMissing(true);
          return;
        }
        prepared = await loadPortableCharacterPack(
          new Blob([new Uint8Array(referenceLook.bytes)]),
        );
        assertSourcePreparationActive({ signal: controller.signal });
        setReference({
          character,
          sourceSha256: bundle.manifest.reference.sourceSha256,
          lookId: referenceLook.logicalId,
          name: referenceLook.name,
          pack: prepared,
        });
        prepared = null;
      } catch (cause) {
        release(prepared);
        if (!controller.signal.aborted)
          setReferenceError(
            cause instanceof Error
              ? cause.message
              : "Original reference unavailable.",
          );
      }
    })();
    return () => controller.abort();
  }, [
    compare,
    active,
    character,
    originalEntry,
    requestedLookId,
    theme?.manifest.reference.sourceSha256,
  ]);

  useEffect(() => {
    if (!playing || !active || !clip || busy) return;
    let handle = 0;
    const start =
      performance.now() - (currentPosition.current * 1000) / clip.fps;
    const tick = (now: number) => {
      // Freeze the last accepted frame while a theme is prepared, even before
      // React flushes the busy state. A canceled load resumes that same pose.
      if (operation.current) return;
      const progress = Math.floor(((now - start) * clip.fps) / 1000);
      if (!clip.loop && progress >= clip.frames.length) {
        setPosition(clip.frames.length - 1);
        setPlaying(false);
        return;
      }
      setPosition(clip.loop ? progress % clip.frames.length : progress);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, active, clip, busy]);

  function changePlayback(
    nextAction: PortableAnimationName,
    nextFacing: Facing,
  ) {
    if (!session) return;
    setSession(
      selectThemePlayback(session, { action: nextAction, facing: nextFacing }),
    );
    if (nextAction !== action) {
      setPosition(0);
      setPlaying(false);
    }
  }
  async function importFile(file: File, kind: "theme" | "session") {
    const motion = kind === "theme" ? snapshotMotion() : undefined;
    await run(
      kind === "theme" ? "Checking imported theme…" : "Opening theme session…",
      async (signal) => {
        if (
          file.size >
          (kind === "theme" ? THEME_MAX_BYTES : THEME_SESSION_MAX_BYTES)
        )
          throw Error(
            "This file exceeds the supported theme/session size limit.",
          );
        const bytes = new Uint8Array(await file.arrayBuffer());
        assertSourcePreparationActive({ signal });
        let next: ThemeSession;
        if (kind === "session")
          next = await readThemeSession(bytes, { signal });
        else {
          const bundle = await readThemeBundle(bytes, { signal });
          assertPublishedThemeIdentity(bundle, THEME_CATALOG);
          const previous = currentSession.current;
          next = previous
            ? selectTheme(addTheme(previous, bundle), bundle.key)
            : createThemeSession([bundle]);
        }
        await commit(
          next,
          signal,
          kind === "session"
            ? "Theme session restored with its exact artwork. Playback is paused at the first frame."
            : "Imported theme accepted. Choose a matching look if needed.",
          motion,
        );
      },
    );
  }
  async function exportFile(
    kind: "session" | "theme" | "pack" | "png" | "gif",
  ) {
    if (!session || !theme) return;
    const snapshot = session;
    const name = safeFilename(
      `${theme.manifest.character}-${theme.manifest.id}-${session.selection.lookId}`,
    );
    const id = frameId;
    setPlaying(false);
    await run(`Preparing ${kind.toUpperCase()} download…`, async (signal) => {
      if (kind === "session")
        saveBytes(
          await exportThemeSession(snapshot, { signal }),
          `${name}.theme-session.zip`,
        );
      else if (kind === "theme") {
        assertSourcePreparationActive({ signal });
        saveBytes(theme.bytes, `${safeFilename(theme.key)}.theme.zip`);
      } else if (kind === "pack")
        saveBytes(
          await exportSelectedThemePack(snapshot, { signal }),
          `${name}.character.zip`,
        );
      else {
        const selected = getSelectedThemeLook(snapshot);
        if (!selected || id === undefined)
          throw Error("Choose an available look and action first.");
        if (kind === "png")
          saveBytes(
            await themeFramePng(selected.archive, id, facing, { signal }),
            `${name}-${action}-${facing}-${id}.png`,
            "image/png",
          );
        else
          saveBytes(
            await themeActionGif(selected.archive, action, facing, {
              signal,
              onProgress: (done, total) => {
                if (!signal.aborted && alive.current)
                  setBusy(`Preparing GIF ${done}/${total}…`);
              },
            }),
            `${name}-${action}-${facing}.gif`,
            "image/gif",
          );
      }
      assertSourcePreparationActive({ signal });
      setMessage(
        `${kind === "pack" ? "CharacterPack" : kind.toUpperCase()} downloaded. Your accepted artwork is unchanged.`,
      );
    });
  }

  const referenceMatches =
    reference?.character === character &&
    reference?.lookId === requestedLookId &&
    reference?.sourceSha256 === theme?.manifest.reference.sourceSha256;
  const referenceClip = referenceMatches
    ? reference.pack.manifest.animations[action]
    : undefined;
  const referencePosition =
    referenceClip && clip
      ? transferThemeMotion(clip, referenceClip, safePosition, playing, true)
          .position
      : 0;
  const comparison =
    compare && pack && referenceMatches
      ? createThemeComparisonPlanes(
          pack.manifest,
          reference.pack.manifest,
          facing,
        )
      : undefined;
  const planes = comparison?.planes;
  return (
    <section className="theme-workspace" aria-label="Character themes">
      <div className="theme-toolbar">
        <label>
          Character
          <select
            aria-label="Theme character"
            value={character}
            disabled={!!busy}
            onChange={(event) => {
              const next = event.target.value as KlingCharacterId;
              const entry = THEME_CATALOG.find(
                (candidate) =>
                  candidate.character === next && candidate.isOriginal,
              );
              if (entry) void openTheme(entry.key, true);
            }}
          >
            <option value="male">Kling male</option>
            <option value="female">Kling female</option>
          </select>
        </label>
        <div className="theme-file-actions">
          <button disabled={!!busy} onClick={() => themeInput.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            Import theme
          </button>
          <button
            disabled={!!busy}
            onClick={() => sessionInput.current?.click()}
          >
            Open theme session
          </button>
          <button
            disabled={!!busy || !session}
            onClick={() => void exportFile("session")}
          >
            Save theme session
          </button>
        </div>
        <input
          ref={themeInput}
          type="file"
          accept=".zip"
          aria-label="Theme bundle file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importFile(file, "theme");
          }}
        />
        <input
          ref={sessionInput}
          type="file"
          accept=".zip"
          aria-label="Theme session file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importFile(file, "session");
          }}
        />
      </div>
      <div className="theme-cards" aria-label="Available art themes">
        {items.map((entry) => (
          <button
            key={entry.key}
            className="theme-card"
            aria-pressed={theme?.key === entry.key}
            disabled={!!busy}
            onClick={() => void openTheme(entry.key)}
          >
            {entry.previewUrl ? (
              <img src={entry.previewUrl} alt="" loading="lazy" />
            ) : (
              <Palette size={28} aria-hidden="true" />
            )}
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.description}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="theme-status-row">
        <p role="status" aria-live="polite">
          {busy || message}
        </p>
        {busy && (
          <button onClick={() => operation.current?.abort()}>
            Cancel theme preparation
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="theme-error">
          <strong>Could not change this theme.</strong>
          <p>{error}</p>
          <p>The last accepted session is retained.</p>
        </div>
      )}
      {theme && (
        <>
          <div className="theme-selected-heading">
            <div>
              <p className="workspace-eyebrow">
                {theme.manifest.rendering === "pixel"
                  ? "Pixel artwork"
                  : "Original / smooth artwork"}{" "}
                · Revision {theme.manifest.revision}
              </p>
              <h2>{theme.manifest.name}</h2>
            </div>
            <button
              disabled={!!busy || !originalEntry}
              aria-describedby="theme-restore-help"
              onClick={() =>
                originalEntry && void openTheme(originalEntry.key, true)
              }
            >
              <RotateCcw size={15} aria-hidden="true" />
              Restore Kling original
            </button>
          </div>
          <p className="theme-caption" id="theme-restore-help">
            Restore Kling original returns to the original tank and shorts,
            paused at the first idle frame.
          </p>
          <div className="theme-look-row">
            <label>
              Look
              <select
                aria-label="Theme look"
                value={session!.selection.lookId}
                disabled={!!busy}
                onChange={(event) => void openLook(event.target.value)}
              >
                {!look && (
                  <option value={session!.selection.lookId} disabled>
                    {session!.selection.lookId} — unavailable in this theme
                  </option>
                )}
                {theme.looks.map((item) => (
                  <option key={item.logicalId} value={item.logicalId}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Each look is a complete drawn outfit. Clothing layers from another
              theme are not automatically fitted.
            </p>
          </div>
          {!look && (
            <div className="theme-missing" role="note">
              <strong>
                This theme has no “{session!.selection.lookId}” look.
              </strong>
              <p>
                Your outfit request is retained. Choose an available look above,
                or switch back to the previous theme.
              </p>
            </div>
          )}
          {look && !clip && (
            <div className="theme-missing" role="note">
              <strong>{title(action)} is unavailable in this look.</strong>
              <p>
                Select an available action below. No frames are substituted.
              </p>
            </div>
          )}
          <div className="theme-preview-options">
            <label>
              <input
                type="checkbox"
                checked={keepMotionPhase}
                disabled={!!busy}
                onChange={(event) => setKeepMotionPhase(event.target.checked)}
              />
              Keep motion phase
            </label>
            <label>
              <input
                type="checkbox"
                checked={compare}
                disabled={!originalEntry}
                onChange={(event) => setCompare(event.target.checked)}
              />
              Compare Kling original
            </label>
            <label>
              Display scale
              <select
                aria-label="Theme display scale"
                value={zoom}
                onChange={(event) =>
                  setZoom(
                    event.target.value === "fit"
                      ? "fit"
                      : Number(event.target.value),
                  )
                }
              >
                <option value="fit">
                  {pack?.manifest.scale.pixelArt ? "Native pixels" : "Fit"}
                </option>
                <option value={1}>1× native</option>
                <option value={2}>2× native</option>
                <option value={3}>3× native</option>
              </select>
            </label>
          </div>
          <p className="theme-caption">
            Keep motion phase carries the action, direction and relative
            timeline position across themes and looks for the same character.
            Loading holds the accepted pose; the new theme then resumes its own
            timing. Drawings are not blended or interpolated.
          </p>
          {referenceError && (
            <p className="theme-error" role="alert">
              {referenceError}
            </p>
          )}
          <div
            className={`theme-preview-grid${compare ? " theme-preview-grid--compare" : ""}`}
          >
            {compare && (
              <div className="theme-preview-panel">
                <h3>
                  Kling original ·{" "}
                  {referenceMatches ? reference.name : requestedLookId}
                </h3>
                {comparison?.unavailable ? (
                  <p role="note">{comparison.unavailable}</p>
                ) : reference && referenceClip ? (
                  <ThemeCanvas
                    pack={reference.pack}
                    frameId={referenceClip.frames[referencePosition]}
                    facing={facing}
                    zoom={zoom}
                    label="Original Kling theme reference"
                    testId="theme-reference"
                    plane={planes?.[1]}
                  />
                ) : (
                  <p>
                    {referenceMissing
                      ? `The original theme has no “${requestedLookId}” look. No different outfit is substituted.`
                      : referenceError
                        ? "Reference unavailable."
                        : referenceMatches
                          ? `${title(action)} is unavailable in the original reference.`
                          : "Preparing original reference…"}
                  </p>
                )}
              </div>
            )}
            <div className="theme-preview-panel">
              <h3>{look?.name ?? "Choose a look"}</h3>
              {pack && frameId !== undefined ? (
                <ThemeCanvas
                  pack={pack}
                  frameId={frameId}
                  facing={facing}
                  zoom={zoom}
                  label={`${theme.manifest.name} ${action} ${facing}`}
                  testId="theme-preview"
                  plane={planes?.[0]}
                />
              ) : (
                <div className="theme-empty-preview">
                  No available drawing selected.
                </div>
              )}
            </div>
          </div>
          {compare && referenceMatches && !comparison?.unavailable && (
            <p className="theme-caption">
              Comparison follows each pack’s own drawings at the same action
              phase. The original is scaled to this theme’s frame height and
              both declared anchors are aligned; this is a presentation view.
              Native PNGs retain each theme’s own size and anchor.
            </p>
          )}
          <div className="theme-playback-controls">
            <div
              className="theme-action-buttons"
              role="group"
              aria-label="Theme actions"
            >
              {THEME_ACTIONS.map((name) => (
                <button
                  key={name}
                  aria-pressed={action === name}
                  disabled={!!busy || !look?.archive.manifest.animations[name]}
                  onClick={() => changePlayback(name, facing)}
                >
                  {title(name)}
                  {!look?.archive.manifest.animations[name]
                    ? " · unavailable"
                    : ""}
                </button>
              ))}
            </div>
            <label>
              Facing
              <select
                aria-label="Theme facing"
                value={facing}
                disabled={!!busy || !session}
                onChange={(event) =>
                  changePlayback(action, event.target.value as Facing)
                }
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <button
              disabled={!!busy || !clip}
              onClick={() => {
                if (
                  clip &&
                  !clip.loop &&
                  safePosition === clip.frames.length - 1
                )
                  setPosition(0);
                setPlaying(!playing);
              }}
              aria-label={playing ? "Pause theme" : "Play theme"}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              disabled={!!busy || !clip}
              onClick={() => {
                setPlaying(false);
                setPosition(0);
              }}
            >
              Restart action
            </button>
          </div>
          <label className="theme-frame-control">
            Frame{" "}
            {clip
              ? `${safePosition + 1} / ${clip.frames.length} · source ${frameId}`
              : "unavailable"}
            <input
              type="range"
              aria-label="Theme frame"
              min={0}
              max={Math.max(0, (clip?.frames.length ?? 1) - 1)}
              value={safePosition}
              disabled={!!busy || !clip}
              onChange={(event) => {
                setPlaying(false);
                setPosition(Number(event.target.value));
              }}
            />
          </label>
          {clip && (
            <p className="theme-caption">
              {clip.fps} FPS ·{" "}
              {clip.loop ? "Loop" : "One-shot · holds the final frame"} · In
              place · {pack!.manifest.spritesheet.frameWidth} ×{" "}
              {pack!.manifest.spritesheet.frameHeight} native · Anchor{" "}
              {pack!.manifest.anchor.x}, {pack!.manifest.anchor.y} ·{" "}
              {pack!.manifest.scale.pixelArt
                ? "Nearest-neighbor sampling / integer zoom"
                : "Smooth sampling"}
            </p>
          )}
          <div className="theme-export-actions">
            <button
              disabled={!!busy || !look}
              onClick={() => void exportFile("pack")}
            >
              <Download size={16} aria-hidden="true" />
              Export theme CharacterPack
            </button>
            <button
              disabled={!!busy || !clip}
              onClick={() => void exportFile("png")}
            >
              Export theme PNG
            </button>
            <button
              disabled={!!busy || !clip}
              onClick={() => void exportFile("gif")}
            >
              Export theme GIF
            </button>
            <button disabled={!!busy} onClick={() => void exportFile("theme")}>
              Save theme bundle
            </button>
            <a href="/player.html" target="_blank" rel="noreferrer">
              Open independent player ↗
            </a>
          </div>
          <details className="theme-provenance">
            <summary>Artwork source and compatibility</summary>
            <p>{theme.manifest.provenance}</p>
            <p>{theme.manifest.reference.description}</p>
            <p>
              Theme {theme.key}. Exact revision and embedded artwork are
              preserved by Save theme session. Reopening restores character,
              theme, look, action and facing, paused at the first frame. No live
              drawing service is used.
            </p>
            <p>
              To edit the existing Kling clothing layers, use the Wardrobe tab.
              These theme looks are complete sprite drawings and do not expose
              separate garment layers.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
