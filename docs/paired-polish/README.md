# 双视角日常造型：局部接缝与同页比较

本轮以已合并的 `8961a36` 为基线，集中修正侧视头部遮挡和几处衣料接缝，并把原版／侧视等身高对比放进现有衣橱。原版人物、动作帧序和导出尺寸保持不变。本轮没有新增服装款式，也没有重画身体。

## 从哪里打开

运行 `npm run dev`，在终端显示的地址后打开：

- 男版：`/workbench.html?character=male&mode=paired`
- 女版：`/workbench.html?character=female&mode=paired`

也可从人物库点击 **编辑人物 → 双视角衣橱**。

1. 点击 **应用完整日常造型**，应用新的 **日常造型 · 接缝修订**。
2. 点击 **并排比较**，同时查看原版和侧视。两个画面按原片站姿的可见身高对齐，整段动作使用固定倍率和基线。
3. 使用共同动作／方向控件，或在各自画面下暂停、拖动帧位、前后逐帧检查。两个视频的动作周期不同，因此按各自原始节奏播放。
4. 导出前选择对应视角。PNG、GIF、CharacterPack 仍保留该视角的原生尺寸与动作数据；比较画面的等身高缩放只用于显示。

本批次的历史 GIF／CharacterPack 保留原片连续两跳，播放完停止。后续的[单次跳跃迭代](../kling-single-jump/README.md)为新建会话提供一次跳跃与跑跳衔接，也保留原片对照。侧视没有庆祝动作；原版庆祝可以独立播放，侧视不会补造该动作。手机上两个比较画面纵向排列。

## 本轮修正

| 位置                   | 真实原因与处理                                                                                                     | 同帧查看                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 女侧 95 后脑肤色斜线   | 近手保护多边形误盖后颅。只在实际手部上方空隙收回错误保护，并恢复该区域原有前／后发归属。真实手、耳、脸、颈部保持。 | [3 倍局部](review/female-native95-detail-3x.png) · [完整 1 倍](review/female-native95-full-1x.png) |
| 男侧 81／82 前肩缺口   | 衣料自身的外伸薄片和裁切凹口。局部重整归属边界，延续邻近既有布料，连接领口与袖口。                                 | [82 局部](review/male-native82-detail-3x.png) · [完整帧](review/male-native82-full-1x.png)         |
| 女侧 97 前臂碎片       | 上衣归属中残留独立小块。移除该块，恢复原片皮肤。                                                                   | [局部](review/female-native97-detail-3x.png) · [完整帧](review/female-native97-full-1x.png)        |
| 女侧待机／行走后肩台阶 | 原泡泡袖边缘的小凹口被短发露出。对使用同一袖体的 26 帧做局部轮廓整理，保留体积、褶皱与颜色。                       | [站姿局部](review/female-native0-detail-3x.png) · [完整帧](review/female-native0-full-1x.png)      |

旧套装与素材包保持原样，新版使用独立的 `polished-day`。旧工程打开后仍使用其嵌入的衣料、定位和发型；只有明确应用新版完整造型时才更新。旧版女头部与新版衣料定位不同，不能直接互换绑定，界面会提示使用完整造型更新。

## 实际导出审阅

以下来自应用真实导出的 CharacterPack 或 GIF。比较图只做解码、固定展示缩放、底色和标签，不绘制新人物像素。完整单帧提供原片／修复前／修复后三列；原片用于核对人体轮廓，修复前列才是本轮衣料与发型基线。

| 动画           | 男版                                                                                             | 女版                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 侧视跑步前后   | [右向](review/male-before-after-run-right.gif) · [左向](review/male-before-after-run-left.gif)   | [右向](review/female-before-after-run-right.gif) · [左向](review/female-before-after-run-left.gif)   |
| 侧视跳跃前后   | [右向](review/male-before-after-jump-right.gif) · [左向](review/male-before-after-jump-left.gif) | [右向](review/female-before-after-jump-right.gif) · [左向](review/female-before-after-jump-left.gif) |
| 原版／侧视走路 | [右向](review/male-views-walk-right.gif) · [左向](review/male-views-walk-left.gif)               | [右向](review/female-views-walk-right.gif) · [左向](review/female-views-walk-left.gif)               |
| 原版／侧视跑步 | [右向](review/male-views-run-right.gif) · [左向](review/male-views-run-left.gif)                 | [右向](review/female-views-run-right.gif) · [左向](review/female-views-run-left.gif)                 |
| 原版／侧视跳跃 | [右向](review/male-views-jump-right.gif) · [左向](review/male-views-jump-left.gif)               | [右向](review/female-views-jump-right.gif) · [左向](review/female-views-jump-left.gif)               |

CharacterPack：[男侧视](review/male/side.character.zip) · [女侧视](review/female/side.character.zip)。原版未变，复用原交付：[男原版](../matched-hair/review/male/original.character.zip) · [女原版](../matched-hair/review/female/original.character.zip)。

比较 GIF 中的走路／跑步使用两段原生周期的共同循环时长；跳跃为非循环，较短的一边只在展示中停留在末帧。没有把两个视频强制同步成同一动作相位。详见 [展示帧序](review/presentation.json)。

## 仍需保留的限制

- 男侧 100 耳颈交界的肤色与少量黄绿色边缘来自原片，已对照检查但没有修改：[原片／前后局部](review/male-native100-detail-3x.png)。不能称为已修复。
- 女版部分行走帧的袖口仍有截平，腰部仍有既有红色楔片／叠线；男版部分后肩细条和衣料褶皱仍较生硬。本轮只处理表中范围。
- 两个视角来自不同视频，源头形、光照、动作相位与清晰度仍不同。固定身高展示不等于把它们变成同一个三维角色投影。
- 功能通过不代表全帧无穿帮。当前完整技术结果与视觉结论分别记录在 [验收记录](verification.md)。

## 配置与复现

新 [衣料目录](assets/catalog.json)、[外观目录](assets/appearance-catalog.json) 和 [女侧定位](../../artwork/paired-polish/female-side.registration.json) 是项目实际使用的文件。原版衣料／外观、男侧头发及未修订下装复用已有资产。

```sh
python scripts/prepare-paired-polish-head.py --check
python scripts/prepare-paired-polish-clothing.py --check
node scripts/assemble-paired-polish-catalog.mjs --check
npm run typecheck
npm test
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/dual-view-complete-looks.spec.ts tests/e2e/paired-polish.spec.ts --workers=2 --trace off
python scripts/build-paired-polish-review.py
npm run build
node scripts/smoke-dual-looks-production.mjs docs/paired-polish/review/production
```

Python 依赖见 `scripts/requirements-kling-wardrobe.txt`。作者离线诊断另存于 `artwork/paired-polish/`，与上述应用实际导出分开。先前实际下载作为 [基线索引](baseline.json) 引用；旧可编辑工程由 [精确重组配方](baseline-projects.json) 重建，并核对原下载 SHA，不重复提交大型原片。
