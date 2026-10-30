# 双视角完整日常造型

> 此页保留第一版素材与审阅证据。当前配对发型已在[同款发型修订](../matched-hair/README.md)中更新；原版素材不变，侧视短碎发／长波波改为对应原版的侧分／短波波，同时修复女版跳跃 77 的领口发片。此页旧 GIF 不代表修订后的侧视发型。

双视角衣橱现在可以一起选择服装、发型、发色和基础表情。男版采用侧分短发、短袖翻领衬衫与长裤；女版采用短波波、短袖上衣与短裙。两种视角各用自己的原生素材，保留 Kling 原片的脸型、身体比例、帧序和动作时长。

## 从哪里打开

1. 首页选择人物的 **编辑人物 → 双视角衣橱**。
2. 点击右侧 **应用完整日常造型**，一起应用服装、栗棕发型和柔和微笑。
3. 用 **人物素材** 切换原版／侧视，分别检查动作及左右朝向。
4. **头发与表情** 可分别选择原片／日常发型、栗棕／深棕／铜棕和自然／柔和微笑。**恢复原片头部** 保留当前服装。
5. **服装搭配** 可独立切换上下装及两种配色，或保留原片上装／短裤。

直达路径：`/workbench.html?character=male&mode=paired`、`/workbench.html?character=female&mode=paired`。首次打开仍采用既有棉质搭配，不会自动覆盖旧工程。旧棉质组的定位与新款不同；先使用完整造型，才会一并换到有配对发型的日常组。

## 实际导出审阅

| 人物 | 原片／仅衣服／完整造型 | 两视角跑步 | 独立 CharacterPack |
| --- | --- | --- | --- |
| 男版 | [原版跑步](review/male-original-run-comparison.gif) · [侧视跑步](review/male-side-run-comparison.gif) · [侧视跳跃](review/male-side-jump-comparison.gif) | [原生时钟对照](review/male-two-views-run.gif) | [原版](review/male/original.character.zip) · [侧视](review/male/side.character.zip) |
| 女版 | [原版跑步](review/female-original-run-comparison.gif) · [侧视跑步](review/female-side-run-comparison.gif) · [侧视跳跃](review/female-side-jump-comparison.gif) | [原生时钟对照](review/female-two-views-run.gif) | [原版](review/female/original.character.zip) · [侧视](review/female/side.character.zip) |

[男版实际下载](review/male/) 与 [女版实际下载](review/female/) 保留各自动作的左右 GIF、原生透明 PNG、CharacterPack，以及工作台和独立播放器截图。比较 GIF 从实际导出的包解码，另加标签与展示底色；它们不是重新生成的动作。

原生尺寸关键帧：[男原版](review/male-original-keyframes-native.png) · [男侧视](review/male-side-keyframes-native.png) · [女原版](review/female-original-keyframes-native.png) · [女侧视](review/female-side-keyframes-native.png)。

头发／耳朵／肩颈 2 倍细节：[男原版跑步](review/male-original-run-head-neck-2x.png) · [男侧视跑步](review/male-side-run-head-neck-2x.png) · [女原版跑步](review/female-original-run-head-neck-2x.png) · [女侧视跑步](review/female-side-run-head-neck-2x.png)。细节图采用整数倍最近邻放大，原始下载保持其原生尺寸。

女版两处裙料修补：[原人物／PR58 衣服／修补衣服／完整造型同帧对比](review/female-side-cloth-repairs-2x.png)。

## 这一轮实际改变了什么

- 配对外观以同一组选择控制两份原生工程；两边都加载、校验和准备成功后才一起显示。任意一边失败，当前两份工程保留。
- 原版发型与 `gentle-v2` 表情来自现有已绘制素材；侧视发型也沿用现有素材，没有重新生成整个人物。
- 侧视新增小幅嘴角调整，仅处理原嘴形。男女各有 10 个眨眼、半眨眼或不确定的姿势保留整张原片脸部，避免在模糊五官上补出新形状。它与原版柔和微笑是各自的绘画处理，不保证完全相同的嘴形。
- 女版侧视 walk 原生 ID 32 修补 33 像素裙内露肤，jump ID 92 恢复 315 像素被裁掉的裙料。仅这两个姿势有服装变化，上衣及其他裙装帧不变；ID 指包内原生帧，不是视频时间或原视频帧索引。
- 新裙料作为独立 `complete-day` 服装组提供。原版沿用前一轮对应衣料，侧视使用修订版；旧 `tailored-day` 仍保留。男版继续采用既有 `tailored-day`。

原版发型需要透明画布边距：左右各 32、顶部 128 原生像素；底部不增加。人物像素不缩放，锚点随边距平移。侧视保持原生画幅。工作台为适应预览区域可能采用不同显示缩放，不能据此判断人物被重画或实际比例相同。

## 保存与兼容

**保存双视角工程** 继续使用原有 V1 外层 ZIP，里面两份原生工程保留来源、衣料、外观和预览设置。带外观的原生工程使用已有 V2；恢复原片头部后可以还原为原生 V1。没有引入新的 CharacterPack 格式。

旧工程保持自己嵌入的素材。非本轮配对外观会显示“工程中保存的发型／表情”，不会误标为新款或静默替换；可明确选择替换为配对外观、应用完整造型或恢复原片头部。普通服装切换不会绕过外观的来源／定位绑定。

当前视角仍可导出 PNG、动作 GIF、标准 CharacterPack；导出的包可关闭编辑器后在独立播放器加载。新发型只随选中的角色包导出，不要求播放器加载衣橱素材。

原版保留待机、走路、跑步、跳跃、庆祝；侧视保留自己的四种动作，没有补造庆祝。侧视跳跃仍是原视频的连续两跳。两个视频的动作节奏与相位不同，比较图按各自时钟显示，不强制配成相同帧数或无缝共同循环。

## 检查与仍有限制

本轮功能检查、实际下载校验与视觉结果分别记录在 [verification.md](verification.md)。素材重建与原生渲染审计另见 [外观素材记录](../../artwork/dual-looks/README.md)、[服装修补记录](../../artwork/dual-looks-cloth/README.md)。此前 PR 的测试次数不计入本轮结果。

这轮没有把所有旧服装升级成跨视角衣橱，也没有增加新的发型数量。女版侧视跳跃 [ID 77](review/female-side-jump-head-neck-2x.png) 仍有一小撮前发错误压到领口，来自复用素材的头颈遮挡分区，不能解释成正常后发。男版部分抬臂姿势的领口／袖折仍有硬折痕；侧视下蹲、跳跃的前肩与袖上缘还有明显角状切口，例如[实际跳跃 ID 82](review/male-side-jump-head-neck-2x.png)，仅衣服对照中也已存在。女版侧视 [ID 97](review/female-side-native97-source-clothes-look.png) 前臂仍有小块衣料碎片，部分跳跃外裙缘仍有台阶感。

两个视角的发型是分别绘制的相近款式，发梢、光泽和长度并不完全相同。原片模糊及头部形变保留，头发没有独立的惯性摆动模拟。当前是功能可用的审阅候选，不能宣称全套已无穿帮；像素保护测试不能替代美术验收。

## 重建与验证入口

```sh
python scripts/prepare-dual-looks-side-face.py
python scripts/prepare-dual-looks-appearance.py --check
python scripts/prepare-dual-looks-cloth.py --check
node scripts/build-dual-looks-cloth.mjs --check
node scripts/assemble-dual-looks-cloth-catalog.mjs --check
node scripts/verify-dual-looks-appearance.mjs --view=original
node scripts/verify-dual-looks-appearance.mjs --view=side
npm test
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/dual-view-complete-looks.spec.ts --workers=2
node scripts/build-dual-looks-review.mjs /tmp/dual-looks
```

Python 依赖与原稿来源见素材记录；浏览器测试的实际下载写入 `/tmp/dual-looks`。素材制作和运行播放都不调用运行时绘图 API。生产打包验证入口是 `npm run build` 与 `node scripts/smoke-dual-looks-production.mjs`。
