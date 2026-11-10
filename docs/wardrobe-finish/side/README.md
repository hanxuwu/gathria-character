# 女版侧视：衣物腰线与连续帧修复

本次修复从全服装时序扫描中定位出的两个真实问题：walk 第 21 帧的袖子／躯干突然收窄，以及 run 第 38、39 帧的裙腰突然升高。根因是原有衣物拟合把交叉在身前的前臂附近坐标当成了腰线；人物原视频没有对应的腰部缩短。

只给已有衣物 donor 增加离线、服装专用的腰线控制点，重算这三帧的上衣和裙子，并保留原有独立袖片修整。原 source、共享 registration、人物身体、脸、手、动作帧序和节奏均未修改。旧生成器未提供 `cloth_fit_controls` 时行为不变。

## 直接查看

GIF 左侧 **PINNED** 是修改前服装，右侧 **CURRENT** 是修改后服装；播放使用项目实际 GIF 导出器和实际合成器。

- 基础配色：[走路右向](review/side-female-cream-walk-right.gif)、[走路左向](review/side-female-cream-walk-left.gif)、[跑步右向](review/side-female-cream-run-right.gif)、[跑步左向](review/side-female-cream-run-left.gif)。
- 杏色／蓝裙：[走路](review/dual-tailored-female-side-apricot-walk-right.gif)、[跑步](review/dual-tailored-female-side-apricot-run-right.gif)。
- 当前 polished 版本：[走路](review/polished-female-side-apricot-walk-right.gif)、[跑步](review/polished-female-side-apricot-run-right.gif)。
- 原生像素、固定坐标邻帧：[walk 19–23](review/walk-native-cloth-neighbors.png)、[run 36–40](review/run-native-cloth-neighbors.png)。三行分别是原角色、修改前换装、修改后换装。

## 覆盖与技术验证

更正同步到 14 个 female side 衣物包：基础上衣／裙子、双视角 tailored／complete／polished 的 sea 与 apricot 配色。7 组套装的实际合成检查覆盖 714 帧；每个衣物包的原生补丁检查共 1,428 帧，只允许 42 个指定衣物帧发生变化，跨各配色包累计 422,968 个局部像素变化。其余姿势和受保护人物像素保持完全相同。

所有 12 个 GIF 已独立解码，逐帧核对左右镜像、帧数、循环标志和每帧时间。GIF 使用既有半尺寸显示与统一调色板，PNG 对比保留原生像素。保存重开、混搭和独立 CharacterPack 验证由[完整混搭验收](../mixed/README.md)负责，不能用本页 GIF 检查代替。

[repair-report.json](repair-report.json) 固定每包修改前后 manifest、ZIP 哈希、全部原生帧哈希，以及每个更改区域的前后 RGBA／ownership PNG。`scripts/side_finish_audit.py` 验证后可精确剥离本层，继续运行旧覆盖层断言；不需要读取历史 Git 或下载旧包。素材源绑定、版本、手部和领口权限没有放宽。

## 视觉结论与边界

邻帧中 walk21 的袖体积与腰宽、run38/39 的裙腰高度已有明确改善。可见衣料面积的对称相对变化在 walk20→21 上衣由 50.96% 降至 0.09%，run37→38 裙子由 38.80% 降至 6.76%。这些数值用于解释已看到的变化，不是美术通过阈值；完整前后指标见 [metrics.json](metrics.json)，也保留数值变大的边，避免只挑好看的数据。

仍能看到 walk23／run40 更换 donor 后的袖形差别，以及部分旧腰沿和前臂遮挡边的硬线。这一层没有扩大到整段服装重绘，不能据此宣布全动作无穿帮。原视频本身的手部模糊也保留。

## 重跑

```sh
python scripts/verify-side-finish.py
node scripts/review-side-temporal-finish.mjs --baseline /tmp/wardrobe-finish/side/baseline
python scripts/present-side-temporal-finish.py
```

审计命令直接使用已提交的可逆 PNG 证据。重新生成 before/after GIF 需要本次制作时冻结的旧 ZIP 文件，脚本会逐包核对它们的 `beforeSha256`；没有旧 ZIP 时仍可完整验证修改范围与像素前像，但不能把未知旧素材冒充本页 PINNED。

需要重新制作资产时，使用 `refine-side-temporal-fit.py --baseline … --publish`，然后重新冻结报告、审计 pin、目录和所有实际验收结果。生产默认生成流程不会自动应用本层修改。
