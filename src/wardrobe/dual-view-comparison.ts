import type { RgbaPng } from "../core/baked-source";
import type { AppearancePadding } from "../appearance/contract";

export interface BodyCalibration {
  height: number;
  centerX: number;
  baselineY: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Measure the unchanged source idle, never the selected hair or garments.
 * Repeated source IDs retain their native holds in the median. Padding is
 * removed here so changing a hairstyle cannot change the body's display size. */
export function calibrateSourceBody(
  frames: readonly number[],
  render: (id: number) => RgbaPng,
  padding: Pick<AppearancePadding, "left" | "top">,
): BodyCalibration {
  const samples = frames.map((id) => {
    const image = render(id);
    let left = image.width,
      right = -1,
      top = image.height,
      bottom = -1;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        if (image.pixels[(y * image.width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    if (right < left) throw Error("站姿缺少可见的原人物，无法对齐两个视角。");
    return {
      height: bottom + 1 - top,
      centerX: (left + right + 1) / 2 - padding.left,
      baselineY: bottom + 1 - padding.top,
    };
  });
  if (!samples.length) throw Error("缺少原片站姿，无法对齐两个视角。");
  return {
    height: median(samples.map((sample) => sample.height)),
    centerX: median(samples.map((sample) => sample.centerX)),
    baselineY: median(samples.map((sample) => sample.baselineY)),
  };
}

export interface ComparisonSource {
  body: BodyCalibration;
  width: number;
  height: number;
  padding: Readonly<AppearancePadding>;
}

/** One fixed viewport contains both complete native canvases, including their
 * transparent margins. No framewise centering, resizing or ground locking. */
export function comparisonLayout(
  sources: readonly ComparisonSource[],
  bodyHeight = 460,
) {
  const transforms = sources.map(({ body, padding, width, height }) => {
    const scale = bodyHeight / body.height;
    const center = body.centerX + padding.left;
    const baseline = body.baselineY + padding.top;
    return {
      scale,
      center,
      baseline,
      extentX: Math.max(center, width - center) * scale,
      above: baseline * scale,
      below: (height - baseline) * scale,
    };
  });
  const width =
    Math.ceil(Math.max(...transforms.map((t) => t.extentX)) * 2) + 24;
  const baselineY = Math.ceil(Math.max(...transforms.map((t) => t.above))) + 12;
  const height =
    baselineY + Math.ceil(Math.max(...transforms.map((t) => t.below))) + 12;
  return {
    width,
    height,
    baselineY,
    bodyHeight,
    transforms: transforms.map((t) => ({
      scale: t.scale,
      x: width / 2 - t.center * t.scale,
      y: baselineY - t.baseline * t.scale,
    })),
  };
}

export function advanceNativeClock(
  elapsed: number,
  delta: number,
  clip: { frames: readonly number[]; fps: number; loop: boolean },
) {
  const duration = (clip.frames.length * 1000) / clip.fps;
  const time = clip.loop
    ? (elapsed + delta) % duration
    : Math.min(duration, elapsed + delta);
  return {
    elapsed: time,
    position: Math.min(
      clip.frames.length - 1,
      Math.floor((time * clip.fps) / 1000),
    ),
    finished: !clip.loop && time >= duration,
  };
}
