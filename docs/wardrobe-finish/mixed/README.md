# 混搭与连续帧验收

本轮把“所有服装都能读取”和“搭在一起、连续播放时是否自然”分别记录。
全量时序指标负责定位疑似变化；实际合成、原图对比和人工查看负责判断这些变化是否合理。

## 本轮结果

- 140 个计划组合完成，其中 128 个独立组合实际执行，12 个组合使用输入字节完全相同的已执行结果。实际合成共 12,179 个原生帧，覆盖当前 113/113 个衣物文件。
- 7 组代表搭配共 711 个原生帧分别通过保存重开与独立 CharacterPack 的逐帧像素检查，动作元数据保持一致。导出 28 个 run／jump、左右朝向 GIF。
- 113 个当前包共 10,903 个原生衣物帧完成时序扫描：12,968 条相邻边，其中 gameplay 12,088 条，保留源片段补充 880 条；412 条真实循环接缝，jump 首尾接缝为 0。
- 原生帧中有 888 个不在当前 gameplay 动作集合中，仍统计其衣物像素，并通过源动作补充边检查其连续性。停留帧也保留，报告包含 2,186 条相同帧停留边。

这些是技术覆盖数，不代表 113 套衣物都已逐帧人工确认自然。可重复结果见 [runtime.json](runtime.json)、[temporal.json](temporal.json) 与 [presentation.json](presentation.json)。

## 看实际导出

这些 GIF 左侧为未换装的 source，右侧为当前混搭；衣物组合故意包含跨套装搭配，用于暴露袖口与腰线问题。表中链接朝右，`review` 目录同时提供对应 `left.gif`，28 个文件均已逐帧解码验证镜像、时序与循环标志。

| 代表组合 | 保存／独立导出原生帧 | 跑步 | 单次跳跃 |
| --- | ---: | --- | --- |
| 原男西装外套＋棉短裤 | 88 | [GIF](review/original-male-run-right.gif) | [GIF](review/original-male-jump-right.gif) |
| 原女梅色上衣＋棉短裤 | 96 | [GIF](review/original-female-run-right.gif) | [GIF](review/original-female-jump-right.gif) |
| 侧男衬衫＋长裤 | 107 | [GIF](review/side-tailored-male-run-right.gif) | [GIF](review/side-tailored-male-jump-right.gif) |
| 侧女泡泡袖＋裙子 | 102 | [GIF](review/side-tailored-female-run-right.gif) | [GIF](review/side-tailored-female-jump-right.gif) |
| 男婚礼上衣＋日常长裤／落地候选 | 109 | [GIF](review/side-landing-candidate-male-run-right.gif) | [GIF](review/side-landing-candidate-male-jump-right.gif) |
| 双视角男版海盐配色 | 107 | [GIF](review/dual-tailored-day-male-side-run-right.gif) | [GIF](review/dual-tailored-day-male-side-jump-right.gif) |
| 双视角女版海盐配色 | 102 | [GIF](review/dual-tailored-day-female-side-run-right.gif) | [GIF](review/dual-tailored-day-female-side-jump-right.gif) |

原女完整婚纱与另外两种造型的独立保存／导出和前后 GIF 见[女版领口复核](../female/README.md)。女侧本轮实际修改的同帧 before/after 对比见[衣物连续性修复](../side/README.md)。

## 视觉复核：保留的问题

已目视检查 8 张风险相邻帧板和 7 张代表混搭原生接缝板，记录在 [visual-review.json](visual-review.json)。每个男女／视角组合至少选择一个最高分的实际 gameplay 帧对，再选一个不同帧对；不让同一姿态的不同配色占满两个名额。

高分样本中，鞋子由重叠到分开、前臂遮住胸口和源跳跃末尾的身体变化，在 source 中也清楚存在。这些例子证明风险分数不能直接作为“穿帮”标签。但以下旧问题仍可见，未被技术检查掩盖：

- [原女 waistcoat 62→63](review/temporal-4-female-original.png)：前臂与布料交界仍有硬边和锯齿。
- [原男混搭](review/original-male-native-seams.png)：89 斜袖口、106/108 内侧直切尚不自然。
- [侧男衬衫](review/side-tailored-male-native-seams.png)：72 腋下条纹式拼接，97/100 袖端偏平；海盐配色复用相同形状。
- [侧女泡泡袖](review/side-tailored-female-native-seams.png)：23 腰沿硬边、jump62 近侧袖子压成片状仍在；它们不是本轮修复的21/38/39帧。
- [原女梅色混搭](review/original-female-native-seams.png)：90/102 领口内暖灰色带经独立 source/current 像素复核，确认仍含源背心混色残边；不能全解释为颈部阴影，也不能标为领口全部通过。

因此本轮可以确认技术流程完整、已定位的局部修复有改善；没有给整套素材签发“所有姿势都自然、完全无穿帮”的视觉结论。新的 GIF 保留这些问题，便于继续按帧修整。

## 混搭矩阵

[确定性计划](plan.json)包含当前 21 个素材分组、140 个组合。
所有 83 个“上衣 ID × 下装轮廓类别”风险对均覆盖：短裤、长裤、裙装和沿原剪裁的下装分开计数。
最多两件上衣的分组穷举上下装 ID，包含双视角配色包的 2×2 交叉搭配。
原视角男版上衣较多，按短裤／长裤分层选择并轮换颜色；具体上下装 ID 对 162 个选取 115 个，47 个未选对明确列在计划中。
女版整身裙与独立鞋边也有检查项。它不等于全部发型、表情、肤色与服装的笛卡尔积。

只组合来源与关节配置完全匹配的素材。不同人物／视角／定位文件的包不能通过此检查被强行混穿。
相同字节组合在多个入口重复时，运行报告列为同一已执行配置的别名，避免重复计入实际帧数。
当前选择目录之外另有 43 个归档衣物文件，单独列在 inventory 中；它们不是这 113 个当前包的一部分，本轮没有给归档文件补做视觉通过证明。

实际合成器对每个独立组合渲染全部原生帧，在逐帧绘制时验证头部／手部保护。
代表组合再检查所有帧保存重开、独立 CharacterPack 的逐帧像素与动作时序；导出原图／混搭并排的 run、jump 左右 GIF。
独立包与编辑项目保留在本地 `/tmp/wardrobe-finish/mixed`，只提交审阅图、GIF 与哈希，不重复提交完整源素材。

视觉检查先按实际剪裁区分：脸、手、短袖外的前臂和短裙之外的腿部可保留原皮肤，不能把“有肤色”直接判为漏穿。需要重点检查的是应被衣物覆盖处的原背心／短裤残留、手臂与袖口的错误前后关系、腰沿空洞，以及裙摆运动中突然出现的截口。原动作自身的遮挡与体积变化必须和同一帧 source 对照。

## 全量时序扫描

`triage-wardrobe-temporal-coverage.py` 检查全部当前可选服装包：

- 原生 ownership 与可见衣料面积、外接框、中心及衣料 RGB 分布使用全部原生像素。
- 相邻帧的颜色／轮廓变化在固定原坐标网格上与源动作对照。诊断网格间隔 4 像素，不修改或缩放输出素材。
- 使用当前实际 gameplay 动作定义，保留停留帧；待机、走跑和庆祝按各自动作真实 loop 字段检查环接，基本跳跃不添加首尾回跳。
- 对仍保留在源包、但 gameplay 省略的准备帧或庆祝片段，补扫尚未覆盖的源动作相邻边，标记 `nativeSourceSupplement`。这些边不代表当前游戏播放器一定会播放；源 jump 同样不添加闭环。
- 变化排序仅用于审阅：正常摆臂、透视变化、前后遮挡和裙摆运动也会产生高值。一像素接缝可能低分，不能仅靠指标宣布没有穿帮。

## 重跑

先由主流程安装并刷新已审核素材和目录。以下命令只读取生产素材并写审阅结果：

```sh
python scripts/inventory-wardrobe-coverage.py --output docs/wardrobe-finish/mixed/inventory.json
node scripts/review-wardrobe-mixed-finish.mjs --inventory docs/wardrobe-finish/mixed/inventory.json
python scripts/triage-wardrobe-temporal-coverage.py --inventory docs/wardrobe-finish/mixed/inventory.json
node scripts/render-wardrobe-temporal-risk.mjs
python scripts/present-wardrobe-mixed-finish.py
python scripts/test_wardrobe_temporal_triage.py
```

制作阶段可用 `--plan-only` 查看计划，或用 `--groups side-tailored-male --out /tmp/mixed-dev` 小范围验证。
完整审阅过程中会重新核对所有输入哈希，若服装或渲染代码同时被修改，必须在稳定版本重跑。
