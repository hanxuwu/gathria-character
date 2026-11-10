# 侧视服装覆盖检查

本轮检查当前页面可选的 36 个侧视服装包、3,747 个“服装 × 原生帧”：男版 107 帧、女版 102 帧，包含 material、tailored 与四类双视角侧视素材。落地候选版本由上级覆盖审查单独检查。14 个原剪裁换色／鞋包没有发现旧服装覆盖缺口，保持原字节；22 个衬衫、长裤、上衣、裙子及配色包修复了手部保护范围误盖旧衣导致的灰背心／深色短裤残留。

主要修改是男版腋下与交叉前臂下的灰条、女版拳头周围的深色短裤块，以及女版领口内的灰色原背心。每个修改位置和同帧衣料取样位置都已冻结到 [recipe.json](../../../artwork/wardrobe-coverage/side/recipe.json)。袖口、真实手部、脸、原始皮肤和动作顺序未重画。男版原生 57 帧还恢复了被裤料误盖的 226 个原片鞋底像素。

手部复核仅属于具体衣物；共享 registration 不变。女版领口仅使用 source/registration 绑定的 V3 布料白名单，不开放头部绘制。保存项目仍包含完整复核边界，独立 CharacterPack 只需要烘焙后的角色图片。

## 视觉审阅

| 检查 | 男版 | 女版 |
|---|---|---|
| 原生尺寸同帧接缝 | [前后对比](review/male-seams-native.png) | [前后对比](review/female-seams-native.png) |
| 走路 | [右向](review/male-walk-before-after-right.gif) · [左向](review/male-walk-before-after-left.gif) | [右向](review/female-walk-before-after-right.gif) · [左向](review/female-walk-before-after-left.gif) |
| 跑步 | [右向](review/male-run-before-after-right.gif) · [左向](review/male-run-before-after-left.gif) | [右向](review/female-run-before-after-right.gif) · [左向](review/female-run-before-after-left.gif) |
| 单次跳跃 | [右向](review/male-jump-before-after-right.gif) · [左向](review/male-jump-before-after-left.gif) | [右向](review/female-jump-before-after-right.gif) · [左向](review/female-jump-before-after-left.gif) |

预览来自实际 `WardrobeCompositor`，使用现有男版 V7／女版 V6 单跳帧序，原生 24 FPS；跳跃 GIF 不循环。所有姿势使用同一显示裁切，没有逐帧重居中。GIF 受 256 色及 10 ms 时间粒度限制；PNG 与项目保留原始 RGBA。具体帧序见 [presentation.json](review/presentation.json)。

## 技术记录与边界

- [全包扫描](audit.json)、[逐帧数据](frame-findings.json)、[资产修改摘要](repair-report.json)。
- [全部 3,747 帧实际渲染验证](runtime-verification.json)：零像素差异、零保护规则错误。
- [可重复的精确修改验证](integrity-verification.json)：22 个修改包与既有 Git 基线比较，仅允许冻结的衣料取样／鞋底恢复像素变化。
- [保存重开和独立导出结果](review/export-verification.json)。ZIP 已在本地实际生成和重开，文件放在 `/tmp/coverage-audit/side/downloads/`，不重复提交源素材归档；下方命令可重新生成。

自动标记不等于穿帮：粉色鞋面、鞋底和正常露出的脚踝会进入部分肤色引导，必须与原片核对。没有把这些位置统一涂成裤子。为保护手边描边与皮肤抗锯齿，保留了衣料引导边界的一像素安全带，剩余计数仍记录在审查文件中；没有宣称所有边界已完全无残留。原片绿边、袖片的局部几何生硬和视频造型漂移仍是后续美术问题。

复现：

```sh
python scripts/refine-side-cloth-coverage.py
node scripts/verify-side-cloth-coverage.mjs
node scripts/export-side-cloth-coverage-review.mjs
python scripts/review-side-cloth-coverage.py
```

基线固定为已有提交 `5d63ae233ca83e61dc354e122a8708044f4e2653`。生成器不使用颜色阈值重判身体，也不改变共享源视频帧、锚点或动画节奏。技术验证通过不替代上方实际画面的美术验收。
