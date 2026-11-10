import type { PortableAnimationName } from "../core/types";
import type { WardrobeProject } from "./contract";

export type CoverageRegion = "nearHand" | "farHand" | "neck" | "waist" | "hem";
export interface CoverageCheckpoint {
  id: string;
  sourceSha256: string;
  view: "original" | "side";
  character: "male" | "female";
  frameId: number;
  action: PortableAnimationName;
  region: CoverageRegion;
  title: string;
  detail: string;
}
const sources = {
  originalMale:
    "ae589b93e234d17427b6680290a9b46df7d5fcd58f97446ed9fe314296d612d1",
  originalFemale:
    "90a7d2a227910a399dabab805ac1a335240684c06d8d8eb57e88f236a5cbad23",
  sideMale: "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42",
  sideFemale:
    "ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d",
  landingMale:
    "704698872f3a4f621f3d4de53d3fa6a28ef930f6a390c63fb35982d95e51a430",
} as const;

function points(
  source: keyof typeof sources,
  character: CoverageCheckpoint["character"],
  view: CoverageCheckpoint["view"],
  rows: Array<[number, PortableAnimationName, CoverageRegion, string, string]>,
): CoverageCheckpoint[] {
  return rows.map(([frameId, action, region, title, detail]) => ({
    id: `${source}-${frameId}-${region}`,
    sourceSha256: sources[source],
    character,
    view,
    frameId,
    action,
    region,
    title,
    detail,
  }));
}

/** Reviewed locations, not declarations that the currently selected outfit is
 * defective or passed. Exact source bytes bind the coordinates; a known frame
 * number in an unrelated imported source must never activate a checkpoint. */
export const COVERAGE_CHECKPOINTS: readonly CoverageCheckpoint[] = [
  ...points("originalMale", "male", "original", [
    [
      106,
      "jump",
      "nearHand",
      "拳边与上衣",
      "检查握拳旁的灰色原背心残边，保留真实手指与描边。",
    ],
    [108, "jump", "nearHand", "上衣与交叉手臂", "复核手臂前后遮挡和袖口接缝。"],
    [
      110,
      "jump",
      "nearHand",
      "落地时拳边衣料",
      "与相邻帧一起确认衣料覆盖稳定。",
    ],
  ]),
  ...points("originalFemale", "female", "original", [
    [
      62,
      "run",
      "nearHand",
      "交叉手臂下的背心",
      "检查手臂下方是否残留灰背心，手臂应继续位于衣服前方。",
    ],
    [90, "jump", "waist", "下蹲腰线", "检查上衣与裤裙交界、原短裤的深色缺口。"],
    [
      103,
      "jump",
      "neck",
      "领口柔边",
      "复核衣料与脖子分界，不把皮肤或原描边当作漏衣。",
    ],
  ]),
  ...points("sideMale", "male", "side", [
    [
      57,
      "jump",
      "hem",
      "裤脚与鞋底",
      "检查裤脚覆盖范围，同时保留原鞋底与脚踝。",
    ],
    [
      72,
      "jump",
      "nearHand",
      "腋下与袖口",
      "复核腋下原背心残片、袖口轮廓与邻帧连续性。",
    ],
    [85, "jump", "waist", "落地腰部", "下蹲时检查上衣压缩、腰线和裤装接缝。"],
  ]),
  ...points("sideFemale", "female", "side", [
    [
      21,
      "walk",
      "nearHand",
      "步行相邻帧衣料",
      "对照 20/21/22 帧复核上衣变化；数值差异不等于穿帮。",
    ],
    [
      38,
      "run",
      "hem",
      "跑步裙摆变化",
      "对照 37/38 帧观察裙摆与腿部遮挡，确认没有突变。",
    ],
    [23, "walk", "nearHand", "拳头旁裙装", "复核拳头旁是否露出原深色短裤。"],
    [80, "jump", "hem", "裙摆与腿部", "检查裙边尖角、截平和腿部前后遮挡。"],
    [93, "jump", "neck", "侧视领口", "复核领口原背心柔边；裸露脖子保持原样。"],
  ]),
  ...points("landingMale", "male", "side", [
    [85, "jump", "waist", "西装下蹲腰部", "检查马甲压缩、腰线与双手的遮挡。"],
    [
      97,
      "jump",
      "nearHand",
      "抬臂袖口",
      "复核袖口直切边与白色衬衫布料，不把布料误认成裸皮。",
    ],
    [
      100,
      "jump",
      "nearHand",
      "举臂袖子接线",
      "检查袖边阶梯、布料拼接和手掌保留范围。",
    ],
    [
      101,
      "jump",
      "nearHand",
      "袖口边缘连续性",
      "复核袖边残色与邻帧变化；原拳头和手掌应保留。",
    ],
  ]),
];

export function coverageCheckpoints(project: WardrobeProject) {
  const source = project.document.sourceSha256;
  if (project.registration.sourceSha256 !== source) return [];
  return COVERAGE_CHECKPOINTS.flatMap((checkpoint) => {
    if (
      checkpoint.sourceSha256 !== source ||
      !project.archive.manifest.frames.some(
        (f) => f.id === checkpoint.frameId,
      ) ||
      !project.registration.frames.some((f) => f.frameId === checkpoint.frameId)
    )
      return [];
    const animations = project.archive.manifest.animations;
    const actions = [
      checkpoint.action,
      ...Object.keys(animations).filter((a) => a !== checkpoint.action),
    ] as PortableAnimationName[];
    for (const action of actions) {
      const position =
        animations[action]?.frames.indexOf(checkpoint.frameId) ?? -1;
      if (position >= 0) return [{ ...checkpoint, action, position }];
    }
    return [];
  });
}
export type BoundCoverageCheckpoint = ReturnType<
  typeof coverageCheckpoints
>[number];
