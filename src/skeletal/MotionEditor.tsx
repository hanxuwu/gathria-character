import { useEffect, useState, type ReactNode } from "react";
import {
  assignPlaybackPose,
  holdPlaybackPose,
  MOTION_FIELDS,
  MOTION_LIMITS,
  removePlaybackFrame,
  setMotionField,
  setMotionFps,
} from "./motion-edit";
import type { AnimationName, MotionClip, MotionKey } from "./types";
import "./motion-editor.css";

export interface MotionEditorProps {
  animation: AnimationName;
  clip: MotionClip;
  sequenceFrame: number;
  disabled?: boolean;
  preview?: ReactNode;
  onSelectFrame: (index: number) => void;
  onChange: (clip: MotionClip, label: string) => void;
  onReset: () => void;
}

const FIELD_LABELS: Record<keyof MotionKey, string> = {
  bodyBob: "Body bob (px)",
  lean: "Body lean (°)",
  armSwing: "Arm swing (px)",
  armAngle: "Arm angle (°)",
  footX: "Foot travel (px)",
  footLift: "Foot lift (px)",
  shoePitch: "Shoe pitch (°)",
};
const ANGLES = new Set<keyof MotionKey>(["lean", "armAngle", "shoePitch"]);
const degrees = (radians: number) => (radians * 180) / Math.PI;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const readable = (value: number) => String(Math.round(value * 100) / 100);

/** Draft input keeps partial numbers (minus signs, decimal points, blanks)
 * outside saved state. Blur/Enter makes one edit; Escape discards the draft. */
function MotionNumber({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(readable(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(readable(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    // Do not round-trip an untouched display value: radians may have greater
    // precision than the two decimal places shown by the number field.
    if (draft === readable(value)) return;
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(readable(value));
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
  };
  return (
    <label className="motion-number">
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
            setDraft(readable(value));
            setInvalid(false);
          }
        }}
      />
      {invalid && (
        <small role="status">
          Use {readable(min)}–{readable(max)}; kept previous value.
        </small>
      )}
    </label>
  );
}

export function MotionEditor({
  animation,
  clip,
  sequenceFrame,
  disabled = false,
  preview,
  onSelectFrame,
  onChange,
  onReset,
}: MotionEditorProps) {
  const frame = Math.max(0, Math.min(clip.sequence.length - 1, sequenceFrame));
  const keyIndex = clip.sequence[frame];
  const pose = clip.keys[keyIndex];
  const occurrences = clip.sequence.filter(
    (index) => index === keyIndex,
  ).length;
  const changed = (next: MotionClip, label: string) => {
    if (next !== clip) onChange(next, label);
  };
  return (
    <fieldset
      className="motion-editor"
      disabled={disabled}
      onFocusCapture={() => onSelectFrame(frame)}
    >
      <legend>Motion editor</legend>
      <div className="motion-summary">
        <p>
          <strong>{animation}</strong> · {clip.keys.length} source poses ·{" "}
          {clip.sequence.length} playback frames ·{" "}
          {(clip.sequence.length / clip.fps).toFixed(2)} s loop
        </p>
        <MotionNumber
          key={`${animation}-fps`}
          label="Motion FPS"
          value={clip.fps}
          min={1}
          max={60}
          step={0.5}
          onCommit={(value) =>
            changed(setMotionFps(clip, value), `${animation}: change FPS`)
          }
        />
      </div>
      <div className="motion-timeline" aria-label="Motion playback timeline">
        {clip.sequence.map((source, index) => (
          <button
            type="button"
            key={index}
            aria-label={`Playback frame ${index + 1}, pose ${source + 1}`}
            aria-pressed={frame === index}
            title={`Frame ${index + 1}: source pose ${source + 1}`}
            onClick={() => onSelectFrame(index)}
          >
            <span>{index + 1}</span>
            <strong>P{source + 1}</strong>
          </button>
        ))}
      </div>
      <div className="motion-playback-tools">
        <label>
          <span>Playback pose</span>
          <select
            aria-label="Playback pose"
            value={keyIndex}
            onChange={(event) =>
              changed(
                assignPlaybackPose(
                  clip,
                  frame,
                  Number(event.currentTarget.value),
                ),
                `${animation}: assign playback pose`,
              )
            }
          >
            {clip.keys.map((_, index) => (
              <option key={index} value={index}>
                Pose {index + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={clip.sequence.length >= 120}
          onClick={() => {
            const next = holdPlaybackPose(clip, frame);
            changed(next, `${animation}: hold pose`);
            if (next !== clip) onSelectFrame(frame + 1);
          }}
        >
          Hold this pose
        </button>
        <button
          type="button"
          disabled={clip.sequence.length <= 1}
          onClick={() => {
            const next = removePlaybackFrame(clip, frame);
            changed(next, `${animation}: remove playback frame`);
            if (next !== clip)
              onSelectFrame(Math.min(frame, next.sequence.length - 1));
          }}
        >
          Remove playback frame
        </button>
      </div>
      <p className="motion-help">
        Editing pose {keyIndex + 1} updates its {occurrences}{" "}
        {occurrences === 1 ? "use" : "uses"} in this loop. Hold adds one timed
        frame without creating another pose. Feet and arms use opposing
        half-cycle poses.
      </p>
      <div className="motion-pose-workspace">
        {preview && (
          <figure className="motion-pose-preview">
            {preview}
            <figcaption>Current pose · native size</figcaption>
          </figure>
        )}
        <div className="motion-pose-fields">
          {MOTION_FIELDS[animation].map((field) => {
            const angle = ANGLES.has(field);
            const [min, max] = MOTION_LIMITS[field];
            return (
              <MotionNumber
                key={`${animation}-${keyIndex}-${field}`}
                label={FIELD_LABELS[field]}
                value={angle ? degrees(pose[field]) : pose[field]}
                min={angle ? degrees(min) : min}
                max={angle ? degrees(max) : max}
                step={0.5}
                onCommit={(value) =>
                  changed(
                    setMotionField(
                      clip,
                      frame,
                      field,
                      angle ? radians(value) : value,
                    ),
                    `${animation}: pose ${keyIndex + 1} ${FIELD_LABELS[field]}`,
                  )
                }
              />
            );
          })}
        </div>
      </div>
      <div className="motion-footer">
        <p className="motion-help">
          Positive body bob moves down. Motion edits travel with the full
          project.
        </p>
        <button type="button" onClick={onReset}>
          Reset {animation} motion
        </button>
      </div>
    </fieldset>
  );
}
