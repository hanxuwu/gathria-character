import type { WardrobeProject } from "./contract";
import {
  coverageCheckpoints,
  type BoundCoverageCheckpoint,
} from "./coverage-checkpoints";
import "./coverage-review.css";

export default function CoverageCheckpoints({
  project,
  disabled,
  onLocate,
}: {
  project: WardrobeProject;
  disabled: boolean;
  onLocate: (point: BoundCoverageCheckpoint) => void;
}) {
  const points = coverageCheckpoints(project);
  return (
    <section
      className="coverage-checkpoints"
      aria-label="服装覆盖检查点"
      data-testid="coverage-checkpoints"
    >
      <h4>已记录的覆盖检查点</h4>
      <p>
        按当前人物原片匹配。定位只切换姿势，不替换搭配；这些位置需要复核，不代表当前服装一定有问题或已经通过美术验收。
      </p>
      {points.length ? (
        <ul>
          {points.map((point) => (
            <li key={point.id}>
              <div>
                <strong>
                  {point.character === "male" ? "男版" : "女版"} ·{" "}
                  {point.view === "side" ? "侧视" : "原视角"} · {point.title}
                </strong>
                <p>{point.detail}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                data-testid={`coverage-locate-${point.frameId}`}
                onClick={() => onLocate(point)}
              >
                查看 {point.action} · 帧 {point.frameId}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="coverage-no-checkpoints">
          当前原片没有已绑定的检查点。仍可手动逐帧检查与记录。
        </p>
      )}
    </section>
  );
}
