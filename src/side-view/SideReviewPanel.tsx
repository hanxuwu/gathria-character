import { useEffect, useRef, useState } from "react";
import type { Facing } from "../core/types";
import type { WardrobeProject } from "../wardrobe/contract";
import type { SideAction } from "./motion";
import {
  MAX_REVIEW_NOTE_LENGTH,
  MAX_REVIEW_NOTES,
  REVIEW_RATES,
  REVIEW_REGIONS,
  readReviewNotes,
  reviewCrop,
  reviewLookKey,
  reviewNoteKey,
  reviewNotesDocument,
  reviewStorageKey,
  storeReviewNote,
  type ReviewNote,
  type ReviewRate,
  type ReviewRegion,
} from "./review";

export default function SideReviewPanel({
  project,
  character,
  action,
  frame,
  facing,
  busy,
  rate,
  onRate,
  onPose,
  getFrame,
}: {
  project: WardrobeProject;
  character: string;
  action: SideAction;
  frame: number;
  facing: Facing;
  busy: boolean;
  rate: ReviewRate;
  onRate: (rate: ReviewRate) => void;
  onPose: (note: ReviewNote) => void;
  getFrame: (frame: number, source: boolean) => HTMLCanvasElement;
}) {
  const scope = { character, sourceSha256: project.document.sourceSha256 };
  const storageKey = reviewStorageKey(scope);
  const [notes, setNotes] = useState<ReviewNote[]>(() => {
    try {
      return readReviewNotes(localStorage.getItem(storageKey), scope);
    } catch {
      return [];
    }
  });
  const [region, setRegion] = useState<ReviewRegion>("nearHand");
  const [scale, setScale] = useState<2 | 3>(2);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const dressedRef = useRef<HTMLCanvasElement>(null);
  const lookKey = reviewLookKey(project);
  const registration = project.registration.frames.find(
    (entry) => entry.frameId === frame,
  );
  const crop = registration
    ? reviewCrop(
        registration,
        region,
        project.registration.frameWidth,
        project.registration.frameHeight,
      )
    : null;

  useEffect(() => {
    if (!crop || busy) return;
    for (const [canvas, source] of [
      [sourceRef.current, true],
      [dressedRef.current, false],
    ] as const) {
      if (!canvas) continue;
      const context = canvas.getContext("2d");
      if (!context) continue;
      const image = getFrame(frame, source);
      // Side sources have zero appearance padding. Keep the source crop aligned
      // if a compatible reopened project declares output padding in the future.
      const padding =
        image.width === project.registration.frameWidth &&
        image.height === project.registration.frameHeight
          ? { left: 0, top: 0 }
          : (project.appearanceBank?.manifest.padding ?? { left: 0, top: 0 });
      canvas.width = crop.width * scale;
      canvas.height = crop.height * scale;
      context.imageSmoothingEnabled = false;
      context.save();
      if (facing === "left") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(
        image,
        crop.x + padding.left,
        crop.y + padding.top,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      context.restore();
      canvas.dataset.frame = String(frame);
      canvas.dataset.crop = JSON.stringify(crop);
      canvas.dataset.scale = String(scale);
      canvas.dataset.facing = facing;
    }
  }, [frame, facing, region, scale, project, busy, getFrame]);

  function persist(next: ReviewNote[]) {
    setNotes(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(reviewNotesDocument(scope, next)),
      );
      setMessage("问题记录已保存在当前浏览器，可导出 JSON。");
    } catch {
      setMessage(
        "浏览器存储不可用，记录仅保留在当前审阅面板中；关闭前请导出 JSON。",
      );
    }
  }
  function saveNote() {
    if (!text.trim() || busy) return;
    persist(
      storeReviewNote(notes, {
        action,
        frame,
        facing,
        region,
        text: text.trim().slice(0, MAX_REVIEW_NOTE_LENGTH),
        lookKey,
        updatedAt: new Date().toISOString(),
      }),
    );
    setText("");
  }
  function exportNotes() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(reviewNotesDocument(scope, notes), null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kling-${character}-side-review.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="side-review-panel"
      aria-label="逐帧审阅"
      data-testid="side-review-panel"
    >
      <div className="side-review-heading">
        <h3>逐帧审阅</h3>
        <span>
          素材帧 {frame} · {facing === "left" ? "朝左" : "朝右"}
        </span>
      </div>
      <p className="side-small-note">
        使用上方时间轴逐帧查看。慢放只改变本页预览，PNG、GIF
        和角色包仍使用原始画面与节奏。
      </p>
      <div className="side-review-options">
        <label>
          预览速度
          <select
            data-testid="side-review-rate"
            value={rate}
            disabled={busy}
            onChange={(event) =>
              onRate(Number(event.currentTarget.value) as ReviewRate)
            }
          >
            {REVIEW_RATES.map((value) => (
              <option key={value} value={value}>
                {value}×{value === 1 ? " · 原速" : " · 慢放"}
              </option>
            ))}
          </select>
        </label>
        <label>
          检查部位
          <select
            data-testid="side-review-region"
            value={region}
            onChange={(event) =>
              setRegion(event.currentTarget.value as ReviewRegion)
            }
          >
            {Object.entries(REVIEW_REGIONS).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          整数放大
          <select
            data-testid="side-review-scale"
            value={scale}
            onChange={(event) =>
              setScale(Number(event.currentTarget.value) as 2 | 3)
            }
          >
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </label>
      </div>
      <div className="side-review-details">
        <figure>
          <figcaption>原片 · 同一帧</figcaption>
          <div
            className="side-review-scroll"
            tabIndex={0}
            aria-label="原片局部，可横向滚动"
          >
            <canvas
              ref={sourceRef}
              data-testid="side-review-source"
              aria-label="原片局部整数放大"
            />
          </div>
        </figure>
        <figure>
          <figcaption>当前搭配 · 同一帧</figcaption>
          <div
            className="side-review-scroll"
            tabIndex={0}
            aria-label="当前搭配局部，可横向滚动"
          >
            <canvas
              ref={dressedRef}
              data-testid="side-review-dressed"
              aria-label="当前搭配局部整数放大"
            />
          </div>
        </figure>
      </div>
      <p className="side-small-note">
        局部按原生像素整数放大，不拉伸适应屏幕；小屏可在图内滚动。定位点仅用于选取检查区域。
      </p>
      <label className="side-review-note-label">
        记录这一帧的问题
        <textarea
          data-testid="side-review-note"
          value={text}
          maxLength={MAX_REVIEW_NOTE_LENGTH}
          disabled={busy}
          placeholder="例如：近侧手腕后方残留了旧短裤，朝左也能看到。"
          onChange={(event) => setText(event.currentTarget.value)}
          rows={3}
        />
      </label>
      <div className="side-review-note-actions">
        <button
          type="button"
          data-testid="side-review-bookmark"
          disabled={busy || !text.trim()}
          onClick={saveNote}
        >
          保存问题帧
        </button>
        <button
          type="button"
          data-testid="side-review-export"
          disabled={!notes.length}
          onClick={exportNotes}
        >
          导出审阅 JSON（{notes.length}）
        </button>
      </div>
      <p className="side-small-note">
        最多保存 {MAX_REVIEW_NOTES}{" "}
        条，按角色与原片分别保存。同帧、部位、朝向和搭配的记录会更新；问题记录独立于角色项目。
      </p>
      {message && (
        <p
          role="status"
          className="side-small-note"
          data-testid="side-review-message"
        >
          {message}
        </p>
      )}
      <ol className="side-review-notes" data-testid="side-review-notes">
        {notes.map((note) => (
          <li key={reviewNoteKey(note)}>
            <div>
              <strong>
                {
                  { idle: "待机", walk: "行走", run: "跑步", jump: "跳跃" }[
                    note.action
                  ]
                }{" "}
                · 素材帧 {note.frame} · {note.facing === "left" ? "左" : "右"} ·{" "}
                {REVIEW_REGIONS[note.region]}
              </strong>
              {note.lookKey !== lookKey && (
                <small>
                  记录时的搭配或素材版本不同；定位只恢复姿势，不自动换装。
                </small>
              )}
              <p>{note.text}</p>
            </div>
            <div className="side-review-note-actions">
              <button
                type="button"
                disabled={
                  busy ||
                  !project.archive.manifest.animations[
                    note.action
                  ]?.frames.includes(note.frame)
                }
                onClick={() => {
                  setRegion(note.region);
                  onPose(note);
                }}
              >
                定位此帧
              </button>
              <button
                type="button"
                onClick={() =>
                  persist(
                    notes.filter(
                      (item) => reviewNoteKey(item) !== reviewNoteKey(note),
                    ),
                  )
                }
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
