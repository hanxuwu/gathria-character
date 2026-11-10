# 低位迈步恢复候选 V4

男版落地接跑现在使用两张重新补绘的低位恢复姿态：`85 → 107 → 108 → Run48`。人物在低位开始卸重、抬脚，再逐步起身，减少上一版先停住、随后突然抬高头部的感觉。这是独立实验候选，尚待用户美术验收；默认男版 V7、女版 V6 不变。

入口：启动项目后打开 `/workbench.html?character=male&mode=side-view&collection=landing-candidate`。选择原人物、日常装或西装，使用“跑 → 跳 → 跑”预览，也可以在移动中触发一次跳跃。

## 实际导出

- [三套造型向右](review/three-looks-run-jump-run-right.gif) · [向左](review/three-looks-run-jump-run-left.gif)
- 固定地面对比：[原人物](review/original-fixed-ground-before-after-right.gif) · [日常装](review/daily-fixed-ground-before-after-right.gif) · [西装](review/wedding-fixed-ground-before-after-right.gif)
- [视觉检查](review/visual-review.md) · [完整验证记录](review/validation-summary.json)
- 混搭导出：[日常上衣＋西装裤](review/mixed-daily-top-wedding-bottom.gif) · [西装上衣＋日常裤](review/mixed-wedding-top-daily-bottom.gif)
- [实际工作台截图](review/wedding-workbench.png) · [独立播放器](review/wedding-independent-player.png) · [旧 V3 实际重开检查](review/v3-backward-compatibility.json)

完整动画来自实际工作台导出；固定地面短片使用实际服装合成器和移动控制器，保持相同时间、700 px/s 速度、24 FPS 和固定相机。短片末尾是明确标注的诊断窗口重置，不用于判断动画循环。

## 本轮改变

107 采用第六轮补绘的身体，降低腰部并保持支撑脚接地；108 采用第三轮补绘的身体，让支撑腿逐步后收、近侧腿继续抬起。两帧都是新增美术，不能称为原视频提取帧。每帧头部从原片 89 逐像素复制，分别平移 `(+4,+11)`、`(-16,-2)`，没有缩放或重绘脸部。

人物基础动作、原片 0–106 的图像、前三页图集和已有服装帧保留。重新记录两张补绘帧的 17 个关节锚点与头部、双手保护区域，并重新适配日常装和西装。发型与表情继续使用原有像素，仅随原片头部改变位置。锚点是人工美术定位，遮挡关节是估计值，不是从视频恢复出的真实骨架。

恢复路径去掉 88 的额外站稳停留，保留原生 24 FPS、跑步 18 帧和基础单次跳跃 28 帧。静止跳跃仍使用完整落地恢复；移动接跑使用自己的过渡路径。

## 视觉改善与边界

在原人物固定地面诊断中，从共同的 85 到 Run48，以透明度至少 128 的轮廓像素测量：

| 指标 | V3 | V4 |
| --- | --- | --- |
| 恢复路径 | 85、88、107、108、48 | 85、107、108、48 |
| 最大单帧头顶上移 | 22 原尺寸像素 | 13 原尺寸像素 |
| 远侧鞋尖累计世界位移 | 约 47.7 像素 | 18.5 像素 |

新头顶高度依次为 269、256、243、231，单步上升 13、13、12 像素。远侧鞋尖横坐标为 328、307、279、259；叠加每帧 29.167 像素的前进后，各步仍有约 8.167、1.167、9.167 像素的残余位移。这是滑步减少，不是完全锁脚；这些数值只描述该速度和这段支撑过程。

[测量记录](review/contact-measurements.json)来自实际合成 PNG 与控制器时钟，并附较低透明度阈值的敏感性结果，避免把抗锯齿边缘当成精确物理接触点。

原视频 85 与 48 之间本就存在头部角度和阴影差异，新身体也能看出补绘风格。保留这些限制，不以改脸、变速、逐帧重定位或修改旧源图来隐藏。美术是否可接受仍以实际播放为准。

西装马甲在较深的下蹲中仍有斜向拉伸，裤子和袖口仍有较硬的褶皱、边缘。这轮改善的是低位接跑与关节连接，服装细节还不能称为无缝或完全精修。

## 可复用资产与兼容性

- [高清原稿、原生身体与头部重组](../../artwork/kling-landing-production/body/revision-4/)
- [当前输入与人工关节配置](../../artwork/kling-landing-production/body/inputs.json)
- [V3 输入快照](../../artwork/kling-landing-production/body/inputs.v3.json)
- [当前打包资产](../kling-landing-production/assets/)
- [严格像素与版本审计](checks/v3-v4-integrity.json)

源图、定位和动作配置以新的 V4 哈希绑定。V1、V2、V3 的已保存项目与独立包保留各自原图、过渡路径和暂停状态；打开旧项目不会自动换成新补绘。当前导出的 CharacterPack 仍可由现有独立播放器使用。

技术验证与美术判断分别记录在 `review/`；通过类型检查或像素保护测试不等于美术验收通过。
