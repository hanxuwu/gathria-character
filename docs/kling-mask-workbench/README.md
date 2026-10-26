# Kling 衣料遮罩工作台

本批基于 `81991d172ae7fd43e12a89b45184e804532b5a26`（草稿 PR #45），
增加浏览器本地的衣料归属编辑、相邻姿势建议和逐帧审核。旧素材、原角色
精灵图、动作时序及共享注册锚点保持不变。工作台生成新服装版本，随后经过
原有完整候选检查、明确应用和可撤销流程。

## 打开和使用

1. 打开 `/workbench.html?character=female&mode=wardrobe`，选 **Plum pintuck day**。
   男版也可使用一般衣料编辑。切换需要检查的动作和姿势。
2. 展开 **Fitting guides**，在 **Clothing to use as a starting point** 选择上衣、
   裤子或连衣裙，点击 **Edit clothing mask**。
3. 工作台并排显示原角色、原服装和修正草稿。这里隔离当前衣服，统一编辑原生
   朝右坐标；发型、其他衣物与左右播放在后续完整候选窗口检查。
4. **Sample cloth** 在现有衣料上取样，**Add clothing** 按笔刷开始位置克隆这片
   衣料纹理；**Restore source** 释放该衣物的像素归属。支持原生坐标输入、
   撤销一笔和重置当前姿势。关闭遮罩叠加可查看实际草稿像素。
5. **Suggest neighboring poses** 按当前动作顺序提出前后姿势的建议。
   建议保持待审，逐帧选择 **Accept pose** 或 **Reject pose**。
   已有编辑的目标不会被传播覆盖，需要先明确重置。
6. **Save mask draft** 保存可继续编辑的 JSON；**Open mask draft** 只接受同一
   源角色、注册、衣料版本和动作；打开时停在哪一帧不影响恢复。
   使用领口修正的草稿也需要相同选项。
7. 输入新的服装 ID 和名称，点击 **Preview corrected clothing**。
   仅已接受且有变化的姿势进入新衣物；其他姿势保留原画。
8. 在完整候选窗口检查动作、方向与其他服饰，下载 **Save corrected clothing**
   和 **Save mask report**，再明确应用。现有 **Undo styling**、保存重开和
   CharacterPack 独立导出继续使用。

保存的草稿包含审核决定和修改操作；服装 ZIP 包含可复用画面，修正报告记录
已接受/排除的姿势、像素计数及哈希。三者用途不同，建议一起保留。

## 女版领口的具体修正

原注册的头部保护多边形误包含了少量原背心衣料。直接修改共享注册会使既有
服装与发型的哈希绑定失效，因此本批增加明确选择的 **V3 服装**：

- **Include reviewed neckline cloth** 只适用于已绑定的原女版源包和注册。
- 固定审核图仅包含姿势 **89、90、93、101、102、103** 的 **2,053 个**衣料像素。
  导入文件不能提供任意头部豁免区域；重叠的手部保护仍然有效。
- 一般未受保护的身体区域仍需操作者判断衣物应覆盖哪里。这个工具不是自动皮肤识别器。
- 原头部/手部保护、共享注册和外观图层规则保持原样。旧 V1/V2 衣服不会获得新权限。
- 使用原有紫色上衣设计图制作了六个逐姿势的局部 RGB 方案，共 **2,390 个**像素，
  其中 337 个是未受头部保护的衣料孔洞；没有生成新人脸或身体。

[来源、两轮试修与原生诊断](../../artwork/kling-mask-workbench/README.md) 和
[衣料/皮肤约束核验](../../artwork/kling-mask-workbench/source-constraint-verification.json)
分别保留制作过程和独立检查。

第 103 帧的大灰块有明显改善。第 90 帧的模糊灰色过渡带，以及其他帧的窄边缘
仍有保留；本轮没有把六帧全部描述成完美领口。诊断图是离线制作检查，实际
应用导出在下方单独列出。

## 传播的能力边界

传播使用当前两肩和腰部锚点形成的局部仿射估计；它不是光流、人体识别或
新姿势生成。锚点塌缩、翻转、置信度过低或尺度变化过大时会拒绝建议。
推断的肩部会提示额外检查。接收姿势仍按自己的保护范围和原图透明度裁剪。

原图中的皱褶、运动模糊、手臂遮挡，以及腿部相对躯干的运动不会因为传播
自动解决。尤其裤腿、宽裙摆和较大姿势变化需要单独检查。逐帧修正示例使用
人工审核的局部方案；不能把它们全部归功于一次自动传播。

- 一批最多 8 个修改姿势；相同源姿势的时间轴停顿不制造重复画稿。
- 草稿最多 4 MiB，单个局部补绘最多 8,192 个像素；笔画与重放工作量有预检上限，
  过大的输入会在修改草稿前被拒绝。传播记录携带种子操作，重新打开时重新核验推导。
- 单次跳跃不跨结尾传播；循环动作可检查首尾邻接。
- 支持新增衣物内的 RGB/归属修正，不支持拉伸角色、改变骨架或生成缺失部位。
- 编辑针对原角色不透明区域；超出原轮廓的新袖子或裙摆仍需完整素材制作流程。
- 当前方案为修改姿势追加一张图集。已经占满四张图集的衣服需要先离线重新打包。
- 新 V3 可编辑服装需要本批应用；烘焙后的 CharacterPack 沿用现有格式，独立播放器
  无需理解编辑器遮罩。旧可编辑项目与旧服装继续按原规则加载。

## 本轮实际验证与导出

实际采集使用实现提交 `c1e4fc8a37f3b5beff8e257659170fcad22886ef` 的生产构建，
没有替换运行时素材或模拟下载。后续提交只补充审阅材料和验证脚本修正。

### 先看效果

- [向右跳跃：修复前 / 后](review/jump-right-comparison.gif)
- [向左跳跃：修复前 / 后](review/jump-left-comparison.gif)
- [向右跑步：原画保持不变](review/run-right-comparison.gif)
- [六个姿势的领口局部，原生 1 倍](review/neckline-details-1x.png) ·
  [整数 2 倍](review/neckline-details-2x.png)
- [本地审阅页](review/index.html) · [画面来源、裁切和时序记录](review/index.json)

所有对比来自应用实际导出的 PNG/GIF。跳跃保留一次性播放标记和原时序；需要
重看时重新打开图片。展示原头部，便于核对脸型和比例，没有为掩盖问题添加发型。

### 下载与重开

| 文件 | 用途 |
| --- | --- |
| [完整可编辑搭配](projects/female-plum-neckline-reviewed.wardrobe.zip) | 在本批工作台点击 **Reopen wardrobe**，恢复修正上衣与深蓝短裤 |
| [CharacterPack](evidence/final-v1/female-plum-neckline-reviewed.character.zip) | 在独立播放器选择角色包；五种动作及左右播放 |
| [修正衣物](evidence/final-v1/female-plum-neckline-reviewed.garment.zip) | 在女版换装工作台导入、预览后应用，可混搭其他裤装 |
| [遮罩草稿](evidence/final-v1/reviewed.mask-draft.json) | 从原版 **Plum pintuck blouse** 的 Jump 动作打开遮罩工作台，启用审核领口选项后导入 |
| [修正报告](evidence/final-v1/mask-build-report.json) | 追溯六帧接受记录及被排除的待审建议 |

可编辑搭配是实际浏览器下载文件的逐字节副本，见
[保存文件对应记录](delivered-projects.json)。草稿绑定的是原始上衣；它与已生成
的新上衣不是同一编辑起点。新衣物未替换目录中的原默认衣物。

### 功能与数据检查

这些结果均为本轮实际执行，不引用历史通过数：

- 完整单元测试 **413 项 / 42 文件**通过；最后一处重放预算修正后，相关 **10 项**
  单测复验通过，其中 1 项为新增用例。不是声称本地又完整运行了一次 414 项。
- TypeScript 与最终生产构建通过；**23 个不同的 Chromium 用例**通过，包含
  6 个新工作台用例和 17 个既有回归用例，覆盖触屏坐标、撤销、失败原子性与保存重开。
- 实际下载 **22 张原生 PNG、8 个 GIF、1 个 CharacterPack**，保存 6 张界面截图。
  另保存修正衣物、报告、草稿及搭配工程。
- 独立 Pillow/NumPy 校验重建 **96 个角色包姿势**，与导出逐像素一致。
  只有六个接受姿势的 **2,390 个像素**改变，其余 **90 个姿势**不变。
  原透明通道、审核衣料区域以外的头部与手部保护像素保持一致。
- 22 张 PNG 逐像素核对通过；8 个 GIF 解码、帧序、时长和循环标记检查通过，
  4 对左右画面精确镜像，两个跑步方向修复前后均一致。
  GIF 的调色板近似与原生 PNG 的逐像素比较分别记录。
- 实际笔刷修改后撤销恢复原像素；草稿保存重开一致。相邻建议 102 被拒绝后
  使用单独人工方案，104 保持待审并排除在新衣物外。六个最终补绘都是逐帧人工审核，
  不是一次传播自动完成的结果。
- 深蓝短裤搭配保存重开后画面一致；另检查赭色短裤混搭。
  关闭编辑器后，独立播放器完成 **五种动作 × 两个朝向，共 10 组**验证，
  每组观察到所有预定帧位置，无编辑器脚本依赖。

[总验证记录](verification.json)、[实际浏览器操作记录](evidence/final-v1/evidence-index.json)
和[独立解码检查](artifact-validation.json)包含文件哈希、输入、构建与实际操作信息。
首次审计曾错误假定工程内保留未选中衣物；修正为与基线工程及目录原文件核对。
随后修正报告输出路径，最终审计退出码为 0。失败日志保留，不伪装为首次全部成功。

复现时需要 Node 依赖、Chromium，以及装有 Pillow/NumPy 的 Python。使用新的
运行名称与输出文件，不覆盖已保存证据。采集会自动启动生产预览服务器；审计
结束前保留 `dist` 和两个临时工程。下面是新一轮复现的命令，而非额外执行记录：

```sh
npm run build
CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-kling-mask-workbench.mjs --run review-v2 --draft docs/kling-mask-workbench/input/reviewed-neckline.mask-draft.json
python scripts/verify-kling-mask-workbench.py --index docs/kling-mask-workbench/evidence/review-v2/evidence-index.json --output docs/kling-mask-workbench/artifact-validation-review-v2.json
python scripts/render-kling-mask-review.py --index docs/kling-mask-workbench/evidence/review-v2/evidence-index.json --audit docs/kling-mask-workbench/artifact-validation-review-v2.json --output docs/kling-mask-workbench/review-v2
```

`CHROMIUM_PATH` 按本机浏览器位置调整。首次保存的基线工程在临时目录中，
未重复提交到仓库；独立审计新运行需要刚采集出的这份基线工程。

### 视觉判断与剩余工作

第 103 帧的大灰色衣料缺口是本轮最清楚的改善；小范围填补没有改变脸型、身高
或跳跃节奏。第 90 帧的模糊过渡，以及少数窄灰边、原视频运动模糊仍然可见。
技术检查证明修改边界与播放一致性，不能代替你对美术效果的最终验收。

本批保留为[草稿 PR #46](https://github.com/hanxuwu/gathria-character/pull/46)，
基于尚未合并的 [PR #45](https://github.com/hanxuwu/gathria-character/pull/45)，均未合并。
本轮不继续增加服装或扩大补绘区域。
