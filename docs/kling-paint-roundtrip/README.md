# Sprints 56–65: 补绘回导与动作连续性检查

基于已合并的 PR #38。本批完善服装制作和验收流程：网页导出的局部补绘包，
现在可以在网页内重新导入、预览和应用，无需为 RGB 局部修正运行 Python。
新动作检查同时对照参考搭配的相邻帧，帮助查找换装后新增的运动变化。

本轮没有生成新人物或替换默认服装。男版两套用于原样往返检查；女版两套
复用上一批已经记录来源的 V9 衣袖遮挡修复像素，验证同一修复能经网页流程
完整回到角色上。这是制作流程的新增能力，不把旧修复重复计为新素材。

## 如何使用

1. 打开 `/workbench.html?character=male&mode=wardrobe` 或 `character=female`。
   选择搭配，展开 **Fitting guides**，在 **Recipe clothing** 选当前上衣、裤子或裙子。
2. 勾选 **Inspect clothing layer**，定位困难姿势，点击
   **Download this pose for painting** 或 **Download neighboring poses for painting**。
3. 解压，修改 `pose-ID.png`；保留原生尺寸、RGBA 透明度和 `mask-ID.png`。
   只能修改白色归属区域内的 RGB。不要移动、缩放或重画其他身体部位。
4. 在 `recipe.json` 给 `output.id` 和 `output.name` 新名称。文件直接放在 ZIP 根目录，
   不加外层文件夹或绘图软件旁文件。PNG 保持非交错 8-bit RGBA。
5. 穿着同一件原版服装，点击 **Preview painted poses** 导入 ZIP。原来的 PNG 哈希
   可以保留；也可填修改后的哈希。浏览器只接受这两种情况，并重新计算所有输出哈希。
6. 在独立候选窗口检查动作和左右朝向。**Save painted clothing** 下载可重用服装，
   **Save painting report** 下载每帧像素变化及来源记录；明确应用后才改变当前搭配。
   可撤销、保存重开，并继续用原 CharacterPack 导出流程。

需要修改袖长、所有权或外轮廓时，仍使用现有完整素材制作流程。此入口不会
把单张站姿自动适配到所有动作，也不会接受脸部、手部等服装以外的涂改。
原有命令行配色和补绘脚本仍可使用。

## 检查连续动作

先 **Pin current look**，再试新服装，打开 **Open look review**，在
**Motion continuity** 点击 **Check motion transitions**。不固定搭配时，参考为原人物。

- 保留所有时间轴位置和停顿；循环动作检查最后一帧至第一帧，跳跃不添加回环。
- 可按原顺序或运动变化大小排序，查看过渡前后两个姿势，定位到播放器对应位置。
- 同一参考和当前搭配使用共同锚点；左右显示与测量分开处理，不重新对齐或缩放角色。
- **Export motion evidence** 导出带哈希索引的 ZIP：四张原生透明 PNG、完整动作对比 GIF、
  全部过渡的 JSON 和配置绑定。GIF 延续半原生尺寸、米色背景和原始节奏；PNG 保留完整透明度。

测量比较的是 `(当前后帧−当前前帧)−(参考后帧−参考前帧)` 的预乘 RGBA 变化，
可区分幅度相同但方向相反的变化。全帧平均残差按 510 归一化。
换衣服和发型本来就会改变数值，因此它不是穿帮检测器、流畅度评分或视觉验收结论。

## 兼容性与边界

- 旧项目、服装 ZIP、CharacterPack V2/V3、原始精灵图和骨骼候选不改变。
- 一批最多 8 个独立姿势，ZIP 最多 64 MiB，解压总量最多 96 MiB。
  单张补绘 PNG 最多 20 MiB。不支持重叠共用同一图集区域的姿势补绘。
- RGB 使用原始数值及原服装的 PNG 色彩元数据；不做浏览器调色、重采样或插帧。
- 基础服装、注册锚点、蒙版和透明度必须完全匹配；任意后续帧失败会拒绝整个候选。
  已接受搭配和撤销记录保持原状。重新导入不能覆盖同名旧素材。
- 候选仍走完整保护区检查和旧版精确状态检查；切换人物、取消或退出会使待处理结果失效。
- 动作扫描只保留首帧、前帧、下一帧的两个搭配及标量结果，不缓存整个原生动作。
  大图解码、压缩和 ZIP 校验仍有开销；本轮不承诺首次加载提速。
- 补绘报告需单独保存；项目内服装来源记录保留基础文件及输入包哈希。审核备注、
  用户视觉批准和完整修改历史不会被自动附加到 CharacterPack。

## 验证和审阅资料

2026-10-24 已完成四套生产构建流程，全部编辑器关闭后再运行独立播放器。
本轮实际执行了 333 项单元测试、79 项 Chromium 测试，以及最终布局的 3 项针对性复验；
TypeScript 与生产构建通过。记录见 [verification.json](verification.json) 和 [logs](logs/)。
计划与十个阶段完成情况见 [PLAN.md](PLAN.md)。

- 60 个实际下载文件的长度和 SHA256 均匹配；8 个 CharacterPack 共解码 736 个原生姿势。
- 368 对前后姿势中 366 对完全一致。男版全部像素一致；女版两套只在姿势 55 各改变
  451 个已有服装归属内的 RGB 像素，复现旧 V9 修复。相邻 54、56 未改变，63 未加入本次包。
  所有帧的透明度、锚点、布局和时序完全一致；蒙版文件逐字节一致。
- 16 个 GIF 共 440 帧，逐帧核对帧序、24 FPS 对应的 40/50 ms 量化时长、循环标记及左右镜像。
  跑步每圈 16 帧；跳跃 39 帧、播放一次。GIF 含调色板损失，最大全帧平均通道误差约 1.185/255；
  52 张原生 PNG 与实际 CharacterPack 精确一致。
- 8 个动作检查包的全部文件哈希通过；右向 64 个过渡的残差用独立 Python 实现重新计算吻合。
- 保存重开、撤销与男版换裤子混搭完成；4 套 × 5 动作 × 2 朝向共 40 组独立播放通过。
  没有依赖编辑器请求，没有浏览器错误或失败网络请求。

详细结果：[生产操作记录](evidence/capture.json)、[独立解码结果](validation.json)。

### 直接审阅

GIF 左侧是基础搭配，右侧是浏览器回导结果，都是实际应用导出；男版两侧应完全相同。
跑步关键帧图采用 GIF 的半原生尺寸；完整前后对比保留 1 倍原生像素。
本轮没有重新绘制服装或发型，没有向默认目录增加这四个验证副本。

| 组合 | 跑步 | 跳跃 | 原生对比 / 完整跑步帧 |
| --- | --- | --- | --- |
| 男版日常 | [右](review/male-day-run-right-comparison.gif) / [左](review/male-day-run-left-comparison.gif) | [右](review/male-day-jump-right-comparison.gif) / [左](review/male-day-jump-left-comparison.gif) | [原生](review/male-day-native-comparison.png) / [16 帧](review/male-day-run-keyframes.png) |
| 男版婚礼 | [右](review/male-wedding-run-right-comparison.gif) / [左](review/male-wedding-run-left-comparison.gif) | [右](review/male-wedding-jump-right-comparison.gif) / [左](review/male-wedding-jump-left-comparison.gif) | [原生](review/male-wedding-native-comparison.png) / [16 帧](review/male-wedding-run-keyframes.png) |
| 女版日常 | [右](review/female-day-run-right-comparison.gif) / [左](review/female-day-run-left-comparison.gif) | [右](review/female-day-jump-right-comparison.gif) / [左](review/female-day-jump-left-comparison.gif) | [原生](review/female-day-native-comparison.png) / [16 帧](review/female-day-run-keyframes.png) |
| 女版婚礼 | [右](review/female-wedding-run-right-comparison.gif) / [左](review/female-wedding-run-left-comparison.gif) | [右](review/female-wedding-jump-right-comparison.gif) / [左](review/female-wedding-jump-left-comparison.gif) | [原生](review/female-wedding-native-comparison.png) / [16 帧](review/female-wedding-run-keyframes.png) |

局部 3 倍整数放大：[日常裙](review/female-day-detail-3x.png)、[婚礼裙](review/female-wedding-detail-3x.png)。
上臂遮挡下的阶梯状色块在回导后连贯，未改变手臂形状或透明度。

| 下载 | 可独立播放的 CharacterPack | 可重用服装 | 补绘审计报告 |
| --- | --- | --- | --- |
| 男版日常 | [ZIP](evidence/male-day-after.character.zip) | [ZIP](evidence/male-day.garment.zip) | [JSON](evidence/male-day-paint-report.json) |
| 男版婚礼 | [ZIP](evidence/male-wedding-after.character.zip) | [ZIP](evidence/male-wedding.garment.zip) | [JSON](evidence/male-wedding-paint-report.json) |
| 女版日常 | [ZIP](evidence/female-day-after.character.zip) | [ZIP](evidence/female-day.garment.zip) | [JSON](evidence/female-day-paint-report.json) |
| 女版婚礼 | [ZIP](evidence/female-wedding-after.character.zip) | [ZIP](evidence/female-wedding.garment.zip) | [JSON](evidence/female-wedding-paint-report.json) |

独立播放器实际截图：[男日常](evidence/male-day-independent.png)、[男婚礼](evidence/male-wedding-independent.png)、
[女日常](evidence/female-day-independent.png)、[女婚礼](evidence/female-wedding-independent.png)。
同目录保留修复前包、候选预览、动作检查界面和移动端截图。

### 耗时与仍需改善的部分

以下是本次云端 Chromium 的单次测量，不是稳定基准或其他设备的性能保证。
导入时间含验证、重建及候选准备；扫描时间含所需原生帧组合。

| 组合 | 导入 | 右向扫描 | 左向扫描 |
| --- | ---: | ---: | ---: |
| 男版日常（原样） | 6.7 s | 2.7 s | 2.2 s |
| 男版婚礼（原样） | 9.4 s | 3.8 s | 2.6 s |
| 女版日常（RGB 修改） | 19.3 s | 5.9 s | 2.8 s |
| 女版婚礼（RGB 修改） | 38.3 s | 22.0 s | 19.6 s |

功能检查已通过；美术检查不等于用户验收。查看四套完整跑步关键帧、候选预览和局部对比后，
本轮未发现回导新增的头部、比例或服装轮廓变化，像素核对也限定了全部变化位置。
原有男版袖口/裤腿折线仍偏硬，女版部分屈臂和裙摆受力仍需专门补绘，头发与衣物的细节密度
仍不完全一致。本批没有解决这些旧问题，也没有把运动残差低当成视觉合格。
较重女版婚礼组合的处理耗时仍高，后续优化需保留相同像素和取消语义。

### 复验

复验：先 `npm run build`，然后运行 `scripts/capture-kling-paint-roundtrip.mjs`
及 `scripts/verify-kling-paint-roundtrip.py`。需要 Chromium 和现有 Python 图像依赖。
两者设置 `KLING_PAINT_REVIEW_DIR` 指向新的证据目录；捕获脚本还支持
`KLING_PAINT_TEMP`、`KLING_PYTHON` 和 `CHROMIUM_PATH`。保存重开的项目及输入补绘包
默认放在忽略的临时目录，干净克隆需先重新捕获再执行完整解码检查。
每次操作和整个捕获都有超时限制；已完成证据不会被覆盖。
