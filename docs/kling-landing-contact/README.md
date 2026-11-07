# 落地恢复与 GIF 循环接点

本轮继续使用独立的男版落地候选，当前为 **V3 动作版本**。人物母版、脸型、服装、发型、定位点和全部 109 张源图像素保留 V2 原样；男版 V7、女版 V6 默认人物不变。

工作台入口：

```text
/workbench.html?character=male&mode=side-view&collection=landing-candidate
```

## 本轮修正

**完整演示首尾接上原生跑步周期。** 旧 GIF 播到 Run47 后直接重播 Run39。现在在完整返回跑步周期之后继续真实控制器，输出 Run48–56，下一轮从 Run39 开始；没有补重复帧、交叉淡化或修改原帧时长。交互预览和 GIF 使用同一个序列构建器，每轮只有一次跳跃。其他受支持角色的演示也按各自原生周期补齐结尾。

**少停留一张落地姿态。** 地面参照显示，85、88、89 的脚部位置几乎相同，角色却仍以跑步速度前进。V3 保留第一次恢复姿态 88，使用 `85 → 88 → 107 → 108 → Run48`，比 V2 少停留一帧（约 41.67 ms）。起跳、腾空、落地、24 FPS、700 px/s 检查速度及基础 Jump 的 28 帧单次跳跃定义保持原样。只是落地接跑路线不再使用 89；源帧 89 仍完整保留在资产里。

在固定世界坐标中，人工选定的远侧鞋尖从 85 到 Run48 的总位移约由 76.8 降至 47.7 原尺寸像素，减少约 38%。这是特定姿态、速度下的轮廓测量，不是物理接触点求解或完全锁脚；[测量方法与取舍](analysis.md)记录了 ROI、误差和未选用方案。保留 88 可避免完全省略恢复姿态时的 31 px 头顶突升，但最大单帧上抬仍由 15 增至 22 px，需要结合实播审阅。

## 看实际效果

- [三套造型向右](review/three-looks-run-jump-run-right.gif) · [向左](review/three-looks-run-jump-run-left.gif)：完整演示，首尾遵循原生跑步相邻帧。
- [原人物固定地面对比](review/original-fixed-ground-before-after-right.gif) · [日常装](review/daily-fixed-ground-before-after-right.gif) · [西装](review/wedding-fixed-ground-before-after-right.gif)：同时间、同速度、同固定镜头的落地窗口。短窗口末尾重播会重置场景，已在图中标注。
- [完整测量](analysis.json) · [像素保留检查](checks/motion-only-v2-v3.json) · [验证汇总](review/validation-summary.json)。

完整新 GIF 为 78 帧、3250 ms。使用相同循环修正的 V2 为 79 帧、3290 ms（GIF 时长量化到 10 ms）；旧发布的 V2 演示是 70 帧、2920 ms，末尾存在相位跳变。输出长度变化来自补齐尾部跑步并去掉一张落地停留，不是改变跑步速度或源帧节奏。

[独立视觉检查](review/visual-review.md)记录了改善与残留问题；[旧 V2 项目兼容记录](review/v2-backward-compatibility.json)及[独立播放器记录](review/standalone-player-review.json)对应实际浏览器操作。

## 保存、导出与复现

V3 使用新的源归档/定位哈希绑定动作配置。新哈希来自版本和动作选择元数据，原图像素没有变化；V1、V2 的动作配置和自包含保存文件保留各自的落地路径。已导入的旧项目会继续旧版本，另开上述页面可加载最新候选。

资产构建仍使用 `scripts/build-landing-production-assets.py`。`scripts/review-landing-contact.ts` 通过实际 `WardrobeCompositor` 和 `advanceSidePlayback` 输出原尺寸图像及世界坐标；配套展示脚本只按固定比例排版，地面和镜头不会逐帧追随脚部。上下装混搭、暂停重开和独立 CharacterPack 使用既有格式。

本轮不增加美术素材。滑步尚未完全消失，原片与补绘之间的阴影、头部运动和旧袖口边界仍待视觉验收；这个候选继续独立于默认人物。
