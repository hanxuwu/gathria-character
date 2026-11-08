# 男版落地候选的服装覆盖

这是原 V4 落地候选的衣物修订，人物源文件、关节配置、107/108 两张补绘身体、头部和动作路线均不变。
日常装同步侧视衬衫／裤装的衣料修正；西装保留原绘制纹理，补上被误保护成「手」的前臂。

西装上衣共修正 72 帧，使用 110 条服装专属手部审核边界。
原来的手腕估计点在部分帧落在拳头中间，因此修正按实际可见拳头和袖口轮廓进行，不能仅按锚点自动裁切。
原 2,555 个经独立衣料遮罩确认的背心漏出点已全部被当前上衣覆盖。
西装裤同步 52 帧、2,208 个原短裤衣料像素的修正，使用原西装裤本帧相邻布料颜色。

实际工作台分别导出原装、日常装、西装的左右跑跳 GIF，保存重开，并下载独立 CharacterPack。
下面的前后对比由修复前后实际下载的 GIF 并排生成，保留 77 帧和相同逐帧延时，总计 3,210 ms。
GIF 的 10 ms 时间刻度与调色板仅用于预览，原包仍为 24 FPS。

- [西装右向](review/wedding-run-jump-before-after-right.gif) · [西装左向](review/wedding-run-jump-before-after-left.gif)
- [日常右向](review/daily-run-jump-before-after-right.gif) · [日常左向](review/daily-run-jump-before-after-left.gif)
- [对比输入哈希、帧数与延时](review/presentation.json)
- [上衣审阅配方与来源](../../../artwork/kling-landing-production/coverage/README.md)
- [裤装修订记录](../landing-wedding-bottom.json)
- [实际工作台保存、重开和导出记录](review/actual-workbench-review.json)
- [独立播放器与 109 帧导出像素核对](review/standalone-player-review.json)

工作台报告中列出的原始下载 ZIP、PNG 和录像保留在本地审阅目录 `/tmp/coverage-audit/landing-ui`；此目录仅提交对比 GIF、截图和哈希记录，避免重复提交完整人物源包。

衣料覆盖更完整，但第 97 帧袖口仍偏直，100/101 帧袖口拼接仍有阶梯与硬折线，第 101 帧袖边还有 5 个原尺寸暖色残留像素；原手部也有视频模糊。
见[原图／旧版／最终袖口放大图](review/source-before-final-cuffs-native-2x.png)和[剩余问题记录](review/remaining-cuff-findings.json)。图中大块橙红区域主要是原拳头与手掌，不能误判为全部漏出的前臂。
这些是后续美术精修事项；当前并非「完全无缝」的最终美术版本。
V4 身体制作阶段的旧报告仍保留为历史证据；本轮衣物的变化范围以当前覆盖报告为准。
