import { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { downloadBlob } from "../core/pack";
import { sha256 } from "../core/sha256";
import type { Facing, PortableAnimationName } from "../core/types";
import type { WardrobeProject, Rect } from "./contract";
import type { WardrobeCompositor } from "./compositor";
import type { LookComparison } from "./look-comparison";
import ReviewCanvas from "./ReviewCanvas";
import { scanReviewAction } from "./review-analysis";
import {
  buildReviewContactSheets,
  planReviewContactSheets,
} from "./review-sheets";
import {
  createReviewBinding,
  createReviewDocument,
  parseReviewDocument,
  serializeReviewDocument,
  loadReviewDocument,
  saveReviewDocument,
  type ReviewDocument,
  type ReviewIssue,
} from "./review-document";

import {
  createReviewTransfer,
  mergeReviewTransfer,
  serializeReviewTransfer,
  type ReviewTransfer,
  type ReviewTransferLineage,
} from "./review-transfer";

type Scan = Awaited<ReturnType<typeof scanReviewAction>>;
type Region = ReviewIssue["region"];
const regions: Region[] = [
  "full",
  "head",
  "shoulders",
  "waist",
  "hands",
  "feet",
];

export default function ReviewWorkbench({
  project,
  renderer,
  comparison,
  referenceProject,
  frameId,
  action,
  facing,
  disabled,
  onSeek,
}: {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  comparison: LookComparison;
  referenceProject?: WardrobeProject;
  frameId: number;
  action: PortableAnimationName;
  facing: Facing;
  disabled: boolean;
  onSeek: (
    action: PortableAnimationName,
    position: number,
    facing: Facing,
  ) => void;
}) {
  const [document, setDocument] = useState<ReviewDocument | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"split" | "overlay" | "difference">("split");
  const [region, setRegion] = useState<Region>("full");
  const [threshold, setThreshold] = useState(8);
  const [backdrop, setBackdrop] = useState<"cream" | "dark" | "checker">(
    "checker",
  );
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState<ReviewIssue["severity"]>("problem");
  const [scan, setScan] = useState<Scan | null>(null);
  const completedScan = useRef<{
    comparison: LookComparison;
    action: PortableAnimationName;
    threshold: number;
    result: Scan;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [sort, setSort] = useState<"sequence" | "changes">("sequence");
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const noteRevision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const handoffInput = useRef<HTMLInputElement>(null);
  const [handoff, setHandoff] = useState<ReviewTransfer | null>(null);
  const [lineage, setLineage] = useState<ReviewTransferLineage | null>(null);

  useEffect(() => {
    let alive = true;
    noteRevision.current++;
    setHandoff(null);
    setLineage(null);
    setDocument(null);
    setNote("");
    setMessage("");
    void createReviewBinding(project)
      .then((binding) => {
        if (!alive) return;
        const loaded = loadReviewDocument(binding, renderer.manifest);
        setDocument(
          loaded.ok && loaded.document
            ? loaded.document
            : createReviewDocument(binding),
        );
        if (!loaded.ok) setMessage(loaded.error);
      })
      .catch((e) => {
        if (alive) setMessage(String(e.message ?? e));
      });
    return () => {
      alive = false;
    };
  }, [renderer]);
  useEffect(() => {
    revision.current++;
    task.current?.abort();
    task.current = null;
    setWorking(false);
    setProgress("");
    setScan(null);
    completedScan.current = null;
    return () => {
      revision.current++;
      task.current?.abort();
    };
  }, [comparison, action, threshold, disabled, facing]);

  const roi = useMemo<Rect | undefined>(() => {
    if (region === "full") return undefined;
    const r = project.registration.frames.find((f) => f.frameId === frameId);
    if (!r) return undefined;
    const p = r.points;
    const pts =
      region === "shoulders"
        ? [p.neck, p.nearShoulder, p.farShoulder, p.nearElbow, p.farElbow]
        : region === "waist"
          ? [p.waistLeft, p.waistRight, p.nearHip, p.farHip]
          : region === "hands"
            ? [p.nearElbow, p.farElbow, p.nearWrist, p.farWrist]
            : [
                p.nearKnee,
                p.farKnee,
                p.nearAnkle,
                p.farAnkle,
                p.nearToe,
                p.farToe,
              ];
    const dx = comparison.manifest.anchor.x - project.registration.anchor.x,
      dy = comparison.manifest.anchor.y - project.registration.anchor.y;
    const margin = Math.ceil(project.registration.frameWidth * 0.06);
    const pose = project.appearanceBank?.manifest.poses.find(
      (f) => f.frameId === frameId,
    );
    const head = pose?.hairBounds ?? pose?.headBounds;
    if (region === "head")
      return {
        x: (head?.x ?? 0) + dx - margin,
        y: (head?.y ?? 0) + dy - margin,
        width: (head?.width ?? project.registration.frameWidth) + 2 * margin,
        height: Math.ceil((head?.height ?? p.neck.y) + 2 * margin),
      };
    const x = Math.min(...pts.map((p) => p.x)) - margin + dx,
      y = Math.min(...pts.map((p) => p.y)) - margin + dy;
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      width: Math.ceil(Math.max(...pts.map((p) => p.x)) - x + dx + margin),
      height: Math.ceil(Math.max(...pts.map((p) => p.y)) - y + dy + margin),
    };
  }, [project, comparison, frameId, region]);
  function persist(next: ReviewDocument) {
    // Validation happens before accepting either imported or edited notes.
    const normalized = parseReviewDocument(
      serializeReviewDocument(next, renderer.manifest),
      next.binding,
      renderer.manifest,
    );
    noteRevision.current++;
    setDocument(normalized);
    const result = saveReviewDocument(normalized, renderer.manifest);
    setMessage(
      !result.ok
        ? `${result.error} Export review notes to keep this session's changes.`
        : "Review notes saved in this browser.",
    );
  }
  function changeIssue(id: string, change: Partial<ReviewIssue> | null) {
    if (!document) return;
    try {
      persist({
        ...document,
        issues: change
          ? document.issues.map((i) => (i.id === id ? { ...i, ...change } : i))
          : document.issues.filter((i) => i.id !== id),
      });
    } catch (e) {
      setMessage(String(e));
    }
  }
  function addIssue() {
    if (!document || !note.trim()) return;
    const id = `issue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      persist({
        ...document,
        issues: [
          ...document.issues,
          {
            id,
            action,
            frameId,
            facing,
            region,
            severity,
            status: "open",
            note: note.trim(),
          },
        ],
      });
      setNote("");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function importNotes(file?: File) {
    if (!file || !document) return;
    const token = revision.current;
    const notesToken = ++noteRevision.current;
    try {
      if (file.size > 1024 * 1024)
        throw Error("Review notes exceed the 1 MiB limit.");
      const text = await file.text();
      if (token !== revision.current || notesToken !== noteRevision.current)
        return;
      persist(parseReviewDocument(text, document.binding, renderer.manifest));
    } catch (e) {
      if (token !== revision.current || notesToken !== noteRevision.current)
        return;
      setMessage(
        `Could not import review notes: ${String(e)} Existing notes are unchanged.`,
      );
    }
  }
  async function previewIssueHandoff(file?: File) {
    if (!file || !document) return;
    const token = revision.current,
      notesToken = ++noteRevision.current;
    setHandoff(null);
    try {
      if (file.size > 1024 * 1024)
        throw Error("Review notes exceed the 1 MiB limit.");
      const text = await file.text();
      if (token !== revision.current || notesToken !== noteRevision.current)
        return;
      const raw = JSON.parse(text);
      const previous = parseReviewDocument(
        text,
        raw.binding,
        renderer.manifest,
      );
      const proposal = createReviewTransfer(
        previous,
        document.binding,
        renderer.manifest,
      );
      mergeReviewTransfer(document, proposal, renderer.manifest);
      setHandoff(proposal);
      setMessage(
        "Issue handoff prepared. Review the origin before copying; all copied issues will reopen.",
      );
    } catch (e) {
      if (token === revision.current && notesToken === noteRevision.current)
        setMessage(
          `Could not prepare issue handoff: ${String(e)} Existing notes are unchanged.`,
        );
    }
  }
  function applyIssueHandoff() {
    if (!handoff || !document) return;
    try {
      const next = mergeReviewTransfer(document, handoff, renderer.manifest);
      persist(next);
      setLineage(handoff.lineage);
      setHandoff(null);
    } catch (e) {
      setMessage(
        `Could not copy issues: ${String(e)} Existing notes are unchanged.`,
      );
    }
  }
  function beginTask() {
    task.current?.abort();
    const c = new AbortController();
    task.current = c;
    setWorking(true);
    setMessage("");
    return { c, token: ++revision.current };
  }
  async function scanAction() {
    const { c, token } = beginTask();
    try {
      const result = await scanReviewAction(comparison, action, {
        threshold,
        signal: c.signal,
        onProgress: (n, t) => {
          if (token === revision.current && !c.signal.aborted)
            setProgress(`Scanning ${n}/${t}`);
        },
      });
      if (token === revision.current && !c.signal.aborted) {
        completedScan.current = { comparison, action, threshold, result };
        setScan(result);
        setMessage(
          "Action scanned. Differences identify changes, not visual defects.",
        );
      }
    } catch (e) {
      if (token === revision.current)
        setMessage(
          c.signal.aborted
            ? "Review scan canceled. Previous completed results retained."
            : String(e),
        );
    } finally {
      if (token === revision.current) {
        setWorking(false);
        setProgress("");
        task.current = null;
      }
    }
  }
  async function exportBundle() {
    if (!document) return;
    const { c, token } = beginTask();
    try {
      planReviewContactSheets(comparison, action);
      const cached = completedScan.current;
      const result =
        cached?.comparison === comparison &&
        cached.action === action &&
        cached.threshold === threshold
          ? cached.result
          : await scanReviewAction(comparison, action, {
              threshold,
              signal: c.signal,
              onProgress: (n, t) => {
                if (token === revision.current && !c.signal.aborted)
                  setProgress(`Auditing ${n}/${t}`);
              },
            });
      const sheets = await buildReviewContactSheets(
        comparison,
        action,
        facing,
        {
          signal: c.signal,
          onProgress: (n, t) => {
            if (token === revision.current && !c.signal.aborted)
              setProgress(`Drawing sheets ${n}/${t}`);
          },
          referenceLabel: referenceProject ? "PINNED" : "ORIGINAL",
        },
      );
      const files: Record<string, Uint8Array> = {
        "review.json": strToU8(
          serializeReviewDocument(document, renderer.manifest),
        ),
        "scan.json": strToU8(JSON.stringify(result, null, 2)),
      };
      const pages = [];
      for (const page of sheets) {
        const file = `sheets/page-${String(page.page).padStart(3, "0")}.png`;
        files[file] = page.png;
        const { png: _, ...metadata } = page;
        pages.push({ file, ...metadata });
      }
      const entries = [];
      for (const [file, bytes] of Object.entries(files)) {
        if (c.signal.aborted || token !== revision.current) return;
        entries.push({
          file,
          bytes: bytes.length,
          sha256: await sha256(bytes),
        });
      }
      if (c.signal.aborted || token !== revision.current) return;
      const reference = referenceProject
        ? await createReviewBinding(referenceProject)
        : { kind: "original", sourceSha256: document.binding.sourceSha256 };
      if (c.signal.aborted || token !== revision.current) return;
      files["manifest.json"] = strToU8(
        JSON.stringify(
          {
            format: "gathria-look-review-bundle",
            version: 1,
            current: document.binding,
            reference,
            action,
            facing,
            threshold,
            anchor: comparison.manifest.anchor,
            canvas: {
              width: comparison.manifest.spritesheet.frameWidth,
              height: comparison.manifest.spritesheet.frameHeight,
            },
            coordinateSpace:
              "native right-facing, source anchors aligned; panels mirrored individually for left",
            pages,
            files: entries,
            notes:
              "Review evidence only. No character artwork is replaced. Differences are not an aesthetic score.",
          },
          null,
          2,
        ),
      );
      if (c.signal.aborted || token !== revision.current) return;
      const bytes = zipSync(files, { level: 0 });
      if (c.signal.aborted || token !== revision.current) return;
      downloadBlob(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
        `kling-${project.registration.characterId}-${action}-${facing}.review.zip`,
      );
      completedScan.current = { comparison, action, threshold, result };
      setScan(result);
      setMessage(
        `Review bundle saved with ${sheets.length} PNG pages, notes and checksums.`,
      );
    } catch (e) {
      if (token === revision.current)
        setMessage(c.signal.aborted ? "Review export canceled." : String(e));
    } finally {
      if (token === revision.current) {
        setWorking(false);
        setProgress("");
        task.current = null;
      }
    }
  }
  const locked = disabled || working || !document;
  const rows = scan
    ? sort === "changes"
      ? [...scan.rows].sort(
          (a, b) =>
            b.metrics.changedPixels - a.metrics.changedPixels ||
            a.position - b.position,
        )
      : scan.rows
    : [];
  return (
    <section
      className="wardrobe-review-workbench"
      aria-label="Look review workbench"
    >
      <h3>Look review workbench</h3>
      <p>
        Reference: {referenceProject ? "Pinned look" : "Original character"}.
        Inspect aligned drawings, record issues and export reproducible
        evidence. A difference is not automatically a defect.
      </p>
      <div className="wardrobe-playback-controls">
        <label>
          Review mode
          <select
            aria-label="Review mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="split">Side by side</option>
            <option value="overlay">50% overlay</option>
            <option value="difference">Pixel differences</option>
          </select>
        </label>
        <label>
          Review region
          <select
            aria-label="Review region"
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
          >
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Review background
          <select
            aria-label="Review background"
            value={backdrop}
            onChange={(e) => setBackdrop(e.target.value as typeof backdrop)}
          >
            <option>checker</option>
            <option>cream</option>
            <option>dark</option>
          </select>
        </label>
        <label>
          Difference threshold
          <input
            aria-label="Difference threshold"
            type="number"
            min={0}
            max={255}
            value={threshold}
            disabled={working}
            onChange={(e) =>
              setThreshold(
                Math.min(
                  255,
                  Math.max(0, Math.round(Number(e.target.value) || 0)),
                ),
              )
            }
          />
        </label>
      </div>
      <ReviewCanvas
        comparison={comparison}
        frameId={frameId}
        facing={facing}
        mode={mode}
        region={roi}
        threshold={threshold}
        backdrop={backdrop}
      />
      <p>
        Pose {frameId} · {action} · {facing}. Region crops affect this view
        only; scans and contact sheets cover the full canvas.
      </p>
      <div className="wardrobe-playback-controls">
        <button disabled={locked} onClick={() => void scanAction()}>
          Scan current action
        </button>
        <button disabled={!working} onClick={() => task.current?.abort()}>
          Cancel review scan
        </button>
        <button disabled={locked} onClick={() => void exportBundle()}>
          Export review bundle
        </button>
      </div>
      <p aria-live="polite" data-testid="review-status">
        {progress || message}
      </p>
      {scan && (
        <div>
          <p>
            {scan.frameCount} timeline positions · {scan.uniqueFrameCount}{" "}
            drawings · {scan.durationMs.toFixed(0)} ms.{" "}
            {scan.seam
              ? `Loop seam pixel delta: ${scan.seam.meanDelta.toFixed(4)}`
              : "One-shot action: no last-to-first seam is assumed."}
          </p>
          <label>
            Review ordering
            <select
              aria-label="Review ordering"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="sequence">Timeline</option>
              <option value="changes">Most changed first</option>
            </select>
          </label>
          <div className="wardrobe-review-poses">
            {rows.map((row) => (
              <button
                key={row.position}
                disabled={disabled || working}
                onClick={() => onSeek(scan.action, row.position, facing)}
                aria-label={`Review pose ${row.frameId} at ${row.position + 1}`}
              >
                #{row.position + 1} · pose {row.frameId}
                <small>
                  {row.metrics.changedPixels} changed pixels ·{" "}
                  {row.startMs.toFixed(0)} ms
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
      <h4>Review issues</h4>
      <p>
        Notes follow this exact outfit and appearance revision.
        Original/right-facing source pose coordinates are retained; each issue
        also records its viewing direction. Notes are separate from saved
        wardrobe files.
      </p>
      <label>
        Review note
        <textarea
          aria-label="Review note"
          value={note}
          maxLength={2000}
          disabled={locked}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="wardrobe-playback-controls">
        <label>
          Issue severity
          <select
            aria-label="Issue severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
          >
            <option>note</option>
            <option>problem</option>
            <option>blocker</option>
          </select>
        </label>
        <button disabled={locked || !note.trim()} onClick={addIssue}>
          Add review issue
        </button>
        <button
          disabled={locked}
          onClick={() =>
            document &&
            downloadBlob(
              new Blob([serializeReviewDocument(document, renderer.manifest)], {
                type: "application/json",
              }),
              "kling-review-notes.json",
            )
          }
        >
          Export review notes
        </button>
        <button disabled={locked} onClick={() => fileInput.current?.click()}>
          Import review notes
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Review notes file"
          hidden
          onChange={(e) => {
            void importNotes(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="wardrobe-review-handoff">
        <h4>Review a clothing revision</h4>
        <p>
          Bring notes exported from a different look on this same character.
          Copying keeps existing notes and reopens every imported issue for a
          fresh visual check.
        </p>
        <button disabled={locked} onClick={() => handoffInput.current?.click()}>
          Preview issues from another look
        </button>
        <input
          ref={handoffInput}
          type="file"
          accept=".json,application/json"
          aria-label="Review issue handoff file"
          hidden
          onChange={(e) => {
            void previewIssueHandoff(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {handoff && (
          <div aria-label="Issue handoff preview">
            <p>
              {handoff.document.issues.length} issues from look{" "}
              {handoff.lineage.from.lookSha256.slice(0, 12)} →{" "}
              {handoff.lineage.to.lookSha256.slice(0, 12)}. Previously resolved
              issues will be open again; no visual approval is carried forward.
            </p>
            <button disabled={locked} onClick={applyIssueHandoff}>
              Copy issues as open
            </button>{" "}
            <button disabled={locked} onClick={() => setHandoff(null)}>
              Discard issue handoff
            </button>
          </div>
        )}
        {lineage && (
          <button
            disabled={locked}
            onClick={() =>
              downloadBlob(
                new Blob(
                  [serializeReviewTransfer(lineage, renderer.manifest)],
                  { type: "application/json" },
                ),
                "kling-review-handoff.json",
              )
            }
          >
            Export issue handoff
          </button>
        )}
      </div>
      <ul className="wardrobe-review-issues">
        {document?.issues.map((issue) => (
          <li key={issue.id}>
            <strong>
              {issue.status} · {issue.severity} · {issue.region} ·{" "}
              {issue.action} pose {issue.frameId} · {issue.facing}
            </strong>
            <p>{issue.note}</p>
            <button
              disabled={locked}
              onClick={() => {
                setRegion(issue.region);
                onSeek(
                  issue.action,
                  renderer.manifest.animations[issue.action]!.frames.indexOf(
                    issue.frameId,
                  ),
                  issue.facing,
                );
              }}
            >
              Go to issue
            </button>{" "}
            <button
              disabled={locked}
              onClick={() =>
                changeIssue(issue.id, {
                  status: issue.status === "open" ? "resolved" : "open",
                })
              }
            >
              {issue.status === "open" ? "Resolve issue" : "Reopen issue"}
            </button>{" "}
            <button
              disabled={locked}
              onClick={() => changeIssue(issue.id, null)}
            >
              Delete issue
            </button>
          </li>
        ))}
      </ul>
      {document && !document.issues.length && (
        <p>No issues recorded for this exact look.</p>
      )}
    </section>
  );
}
