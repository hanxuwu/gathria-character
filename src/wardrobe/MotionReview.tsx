import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "../core/pack";
import type { Facing, PortableAnimationName } from "../core/types";
import type { WardrobeProject } from "./contract";
import type { LookComparison } from "./look-comparison";
import { scanMotionAction, type MotionScan } from "./motion-review";
import { exportMotionBundle } from "./motion-bundle";
import ReviewCanvas from "./ReviewCanvas";

export default function MotionReview({
  comparison,
  project,
  referenceProject,
  action,
  facing,
  threshold,
  disabled,
  onSeek,
}: {
  comparison: LookComparison;
  project: WardrobeProject;
  referenceProject?: WardrobeProject;
  action: PortableAnimationName;
  facing: Facing;
  threshold: number;
  disabled: boolean;
  onSeek: (
    action: PortableAnimationName,
    position: number,
    facing: Facing,
  ) => void;
}) {
  const [scan, setScan] = useState<MotionScan | null>(null),
    [selected, setSelected] = useState(0);
  const [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  const [sort, setSort] = useState("timeline");
  const task = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(() => {
    revision.current++;
    task.current?.abort();
    task.current = null;
    setScan(null);
    setSelected(0);
    setWorking(false);
    setMessage("");
    return () => {
      revision.current++;
      task.current?.abort();
    };
  }, [comparison, action, facing, threshold, disabled]);
  async function run(exporting = false) {
    task.current?.abort();
    const controller = new AbortController(),
      token = ++revision.current;
    task.current = controller;
    setWorking(true);
    setMessage("");
    const active = () =>
      token === revision.current && !controller.signal.aborted;
    try {
      if (exporting) {
        const bytes = await exportMotionBundle(
          comparison,
          project,
          referenceProject,
          action,
          facing,
          selected,
          {
            signal: controller.signal,
            threshold,
            onProgress: (m) => {
              if (active()) setMessage(m);
            },
          },
        );
        if (!active()) return;
        downloadBlob(
          new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
          `kling-${project.registration.characterId}-${action}-${facing}.motion-review.zip`,
        );
        setMessage(
          "Motion evidence saved: four native PNGs, action comparison GIF and hashed report.",
        );
      } else {
        const result = await scanMotionAction(comparison, action, {
          threshold,
          signal: controller.signal,
          onProgress: (n, t) => {
            if (active()) setMessage(`Checking transitions ${n}/${t}`);
          },
        });
        if (!active()) return;
        setScan(result);
        setSelected(0);
        setMessage(
          "Transitions checked. Review the drawings; larger motion changes are not automatically defects.",
        );
      }
    } catch (error) {
      if (token === revision.current)
        setMessage(
          controller.signal.aborted
            ? "Motion review canceled. The open look is unchanged."
            : String(error),
        );
    } finally {
      if (token === revision.current) {
        setWorking(false);
        task.current = null;
      }
    }
  }
  const edge = scan?.edges[selected];
  const edges = scan
    ? [...scan.edges].sort((a, b) =>
        sort === "motion"
          ? b.residual.meanDelta - a.residual.meanDelta || a.index - b.index
          : a.index - b.index,
      )
    : [];
  return (
    <section aria-label="Motion continuity review">
      <h4>Motion continuity</h4>
      <p>
        Compare consecutive drawings against the original or pinned outfit,
        including real loop boundaries. Holds stay in place; jump does not wrap.
        Clothing and hair can legitimately change motion differences.
      </p>
      <div className="wardrobe-playback-controls">
        <button disabled={disabled || working} onClick={() => void run()}>
          Check motion transitions
        </button>
        <button disabled={!working} onClick={() => task.current?.abort()}>
          Cancel motion review
        </button>
        <button
          disabled={disabled || working || !edge}
          onClick={() => void run(true)}
        >
          Export motion evidence
        </button>
      </div>
      <p aria-live="polite" data-testid="motion-review-status">
        {message}
      </p>
      {scan && (
        <>
          <p>
            {scan.edges.length} transitions · {scan.frameCount} timeline
            positions · {scan.durationMs.toFixed(0)} ms ·{" "}
            {scan.loop
              ? "Loop closure included"
              : "One-shot: no closing transition"}
          </p>
          <label>
            Transition ordering{" "}
            <select
              aria-label="Transition ordering"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="timeline">Timeline</option>
              <option value="motion">Largest motion change</option>
            </select>
          </label>
          <label>
            Transition{" "}
            <select
              aria-label="Motion transition"
              value={selected}
              disabled={disabled || working || !edges.length}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {edges.map((e) => (
                <option value={e.index} key={e.index}>
                  #{e.fromPosition + 1} → #{e.toPosition + 1} · poses{" "}
                  {e.fromFrameId} → {e.toFrameId}
                  {e.loopClosure ? " · loop closure" : ""}
                  {e.hold ? " · hold" : ""} · Δ{" "}
                  {e.residual.meanDelta.toFixed(5)}
                </option>
              ))}
            </select>
          </label>
          {edge && (
            <div
              data-testid="motion-transition"
              data-from-position={edge.fromPosition}
              data-to-position={edge.toPosition}
              data-loop-closure={String(edge.loopClosure)}
            >
              <p>
                Reference motion {edge.reference.meanDelta.toFixed(5)} · current
                motion {edge.current.meanDelta.toFixed(5)} · changed motion{" "}
                {edge.residual.meanDelta.toFixed(5)}. Measurements describe
                pixel changes, not animation quality.
              </p>
              <p>
                From position {edge.fromPosition + 1}, source pose{" "}
                {edge.fromFrameId}
              </p>
              <ReviewCanvas
                comparison={comparison}
                frameId={edge.fromFrameId}
                facing={facing}
                mode="split"
              />
              <p>
                To position {edge.toPosition + 1}, source pose {edge.toFrameId}
              </p>
              <ReviewCanvas
                comparison={comparison}
                frameId={edge.toFrameId}
                facing={facing}
                mode="split"
              />
              <button
                disabled={disabled || working}
                onClick={() => onSeek(action, edge.fromPosition, facing)}
              >
                Go to transition start
              </button>
              <button
                disabled={disabled || working}
                onClick={() => onSeek(action, edge.toPosition, facing)}
              >
                Go to transition end
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
