# Kling 侧视动作：透明候选与原速对比

本轮从已有视频挑选动作，保留原始 24 fps，提供两个可在现有独立播放器中打开的候选包。**跑步可以作为本轮优先审阅项；走路和跨来源跳跃还不能作为最终验收通过的动作。** 默认人物及原来的服装开发分支均保留。

## 先看这些

- [可重播的完整审阅页](index.html)（在本地开发服务中打开 `/docs/kling-side-selection/`）。
- [男女跑步 GIF](review/pair-run-right.gif) · [男女走路候选 GIF](review/pair-walk-right.gif) · [男女跳跃 GIF](review/pair-jump-right.gif)
- [男版跑步：1885 / 2067 / 2360 原速对比](review/male-run-source-comparison.gif)
- [女版跑步：1927 / 2394 原速对比](review/female-run-source-comparison.gif)
- [男版走路：2067 / 1629 候选对比](review/male-walk-alternatives.gif)
- [男版跳跃：2360 双脚跳 / 2067 跑跳对比](review/male-jump-alternatives.gif)
- [男版动作切换](review/male-action-switches.gif) · [女版动作切换](review/female-action-switches.gif)

GIF 里的棋盘格、文字和脚底参考线是审阅背景。**真正的透明素材是 `frames/` 下的 RGBA PNG 与包内 atlas**；GIF 是 256 色预览，不代替原画。预览以 0.5 倍显示 512×768 导出帧，各来源保持同一显示尺度。GIF 以 40/50 ms 交替逼近 24 fps，总时长按 10 ms 舍入；播放器使用精确的 24 fps。

## 选择结果

区间为原视频从 0 开始的帧号，右端不包含。均使用连续原帧，没有抽帧加速或补帧。

| 动作     | 男版来源 / 帧区间         | 女版来源 / 帧区间         | 播放方式                       |
| -------- | ------------------------- | ------------------------- | ------------------------------ |
| 待机     | 1885 / `[240,261)`，21 帧 | 1927 / `[243,259)`，16 帧 | 循环，基本静止，未包含完整眨眼 |
| 走路候选 | 2067 / `[47,65)`，18 帧   | 1721 / `[42,60)`，18 帧   | 循环，0.75 秒 / 双步；偏快     |
| 跑步     | 1885 / `[132,150)`，18 帧 | 1927 / `[135,153)`，18 帧 | 循环，0.75 秒 / 双步           |
| 跳跃候选 | 2360 / `[208,234)`，26 帧 | 2394 / `[206,234)`，28 帧 | 播放一次，停在最后一个原始姿势 |
| 庆祝     | 1885 / `[260,351)`，91 帧 | 1927 / `[260,351)`，91 帧 | 播放一次，保留原动作起止与次数 |

跑步选回较早版本，因为这两段包含完整的近、远侧腿交替和反向摆臂，节奏比后续更急促的版本适合继续审阅。不能仅因为新视频不裁头，就把它的所有动作都视为更好。

走路保留两个男版选项：2067 的循环接点较一致；1629 的双步周期约 0.917 秒，更悠闲，但首尾脚踝与人物画法变化较大。女版 1721 是现有素材中较合适的早段步态，仍有轻快、似小跑的伸腿姿势，**尚未验收为普通自然步行**。

跳跃选取最新版本的第一次起跳至第一次落地，避开第二次跳跃及后续长时间半蹲。不过起始已在刹车下蹲，结束是短暂回弹准备姿势，手臂没有自然放下。它们缺少稳定的待机进入/退出片段，不能强制循环或自动回待机后称作无缝。

## 直接在项目中查看

1. 启动 `npm run dev -- --host 0.0.0.0`，打开同一服务下的 `/player.html`。
2. 点击 **Choose character pack**，分别载入 [男版 ZIP](exports/male.character.zip) 或 [女版 ZIP](exports/female.character.zip)。无须打开编辑器。
3. 切换 Idle、Walk、Run、Jump、Celebrate，检查 Right / Left。跳跃和庆祝播放一次后停在末帧，需明确重播。
4. 可以从播放器重新导出，再在新的播放器页面打开。原画已烘焙到帧中，这两个包不支持套用旧的换装素材。

不需要从默认人物卡片里寻找新选项；本轮没有替换默认人物或把未通过视觉验收的候选放进正式角色目录。

## 逐帧与透明边缘

| 检查                | 男版                                         | 女版                                           |
| ------------------- | -------------------------------------------- | ---------------------------------------------- |
| 跑步关键帧          | [PNG](review/male-run-keyframes.png)         | [PNG](review/female-run-keyframes.png)         |
| 走路关键帧          | [PNG](review/male-walk-keyframes.png)        | [PNG](review/female-walk-keyframes.png)        |
| 跳跃关键帧          | [PNG](review/male-jump-keyframes.png)        | [PNG](review/female-jump-keyframes.png)        |
| 跑步末两帧 → 首两帧 | [PNG](review/male-run-boundary.png)          | [PNG](review/female-run-boundary.png)          |
| 浅色 / 深色背景边缘 | [PNG](review/male-alpha-light-dark.png)      | [PNG](review/female-alpha-light-dark.png)      |
| 不同动作的直接切换  | [PNG](review/male-transition-boundaries.png) | [PNG](review/female-transition-boundaries.png) |
| 左跑步              | [GIF](review/male-run-left.gif)              | [GIF](review/female-run-left.gif)              |
| 右跑步              | [GIF](review/male-run-right.gif)             | [GIF](review/female-run-right.gif)             |

其他左右动作 GIF 也在 `review/`。原视频、逐帧来源、固定配准参数和生成脚本见 [素材说明](../../artwork/kling-side-selection/README.md)、[选择配置](../../artwork/kling-side-selection/selection.json) 和 [配准结果](registered-selection.json)。

## 视觉结论与限制

- 跑步首尾选取同一完整双步周期；没有看到额外的裁头、绿底残块或配准造成的关节断裂。原视频本身的手脚轮廓、光影和轻微体积变化仍然存在。
- 走路有节奏偏快或步态偏硬的问题，不能用循环误差数值代替美术验收。
- 跳跃在轮廓、脸部角度、肩臂体积上与较早视频有明显差异；落地末帧也带有源视频运动模糊。等比缩放无法消除这些差别。
- 女版跳跃源帧 206、233 的后颈仍有轻微橄榄绿色溢色，[暗背景原生尺寸检查图](review/female-jump-edge-check.png) 更明显。源视频运动模糊混入了绿幕，当前抠像没有完全恢复该处颜色；本轮保留并标明，没有把局部重绘冒充原图提取。
- 动作切换预览有意保留直接切换。没有通过交叉淡化、缩放头部或补绘掩盖跳变。预览中的重复循环和落地停留仅用于展示，没有添加到包的原始动作帧中。
- 固定脚底参考点只统一站姿位置，不逐帧锁脚，也不证明游戏中的位移速度与脚步速度匹配。
- 原画透明 PNG 与包内帧保持精确对应。缩放和边缘抠像属于技术处理，不能声称输出像素与未处理视频完全相同。

本批成功标准是可核对原画的候选审阅与播放器交付。并未宣称完成最终横版动作库、无缝状态切换或新视角的换装移植。

## 本轮技术验证

- `npm run test -- src/core/pack-v2.test.ts src/core/pack-v3.test.ts src/consumer/player.test.ts`：3 文件、65 项通过。
- `npm run build`：通过。
- [提取检查](extraction-report.json)：7 个源文件 SHA-256；两包共 345 帧，全部 atlas 回读与注册后 PNG 逐像素一致；RGBA、尺寸、边界、ZIP CRC 及现有解析限制检查通过。
- [预览检查](media-validation.json)：29 个 GIF、22 个派生 PNG 均可解码，检查 GIF 总时长和循环标记。GIF 允许合并完全相同的调色板帧，总时长不变。
- 独立浏览器验证结果及首次测试脚本同步问题记录见 [验证记录](VALIDATION.md)。技术检查与上述视觉结论分别报告。
