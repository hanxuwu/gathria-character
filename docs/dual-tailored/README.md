# 双视角日常新款

本轮在同一个双视角衣橱中增加男版翻领短袖衬衫／长裤、女版圆领短袖上衣／短裙。每个视角使用自己的原生衣料，保留两个 Kling 原人物的脸型、未遮挡身体、原片帧序与动作时长。

## 使用入口

首页 **编辑人物 → 双视角衣橱 → 服装组**，选择新款日常组。顶部 **人物素材** 切换原版和侧视，款式与配色保持一致；每个视角分别保留动作、朝向和帧位。

直达地址仍是 `/workbench.html?character=male&mode=paired` 或 `character=female`。打开后默认仍为上一轮棉质搭配，主动选择新服装组才会更换素材。旧工程不会自动升级到另一套衣料或定位。

每套新款提供海盐蓝／沙色、暖杏／蓝灰两种配色。上装、下装可分别选择原片：例如衬衫搭配原片短裤、原片背心搭配长裤，或短袖上衣搭配原片短裤、原片背心搭配短裙。

旧的彩色棉质背心／短裤仍在独立棉质服装组中。本轮不提供它们与新款的跨组混搭：两组侧视定位不相同，试验直接重绑定或裁掉保护区都产生了明显的灰条、接缝，已拒绝该方案。没有通过放宽保护检查来显示不可靠的混搭选项。

## 先看实际导出

| 人物 | 两种视角跑步 | 原人物与新款 | 独立 CharacterPack |
| --- | --- | --- | --- |
| 男版 | [两种视角](review/male-views-run-right.gif) | [原版跑步](review/male-original-run-source-comparison.gif) · [侧视跳跃](review/male-side-jump-source-comparison.gif) | [原版](review/male/original.character.zip) · [侧视](review/male/side.character.zip) |
| 女版 | [两种视角](review/female-views-run-right.gif) | [原版跑步](review/female-original-run-source-comparison.gif) · [侧视跳跃](review/female-side-jump-source-comparison.gif) | [原版](review/female/original.character.zip) · [侧视](review/female/side.character.zip) |

[男版全部原始导出](review/male/) 与 [女版全部原始导出](review/female/) 包含左右待机、走路、跑步、跳跃，以及原版庆祝 GIF。两视角展示使用各自原生时钟，不将它们强行配成相同动作相位。

同帧修复前后：[男版裤脚](review/male-original-run-cuff-before-after.gif) · [女版走路裙摆](review/female-original-walk-hem-before-after.gif) · [女版跑步裙摆](review/female-original-run-hem-before-after.gif)。

女版手部的原片／修复前／修复后局部图：[手腕重点帧](review/female-original-wrist38-source-before-after-2x.png) · [全部八处对比一](review/female-original-hands-source-before-after-2x-1.png) · [对比二](review/female-original-hands-source-before-after-2x-2.png)。这些图从实际导出的工程和 CharacterPack 解码，仅做整数倍展示放大。

## 素材怎样制作

- 男版复用已绘制的闭合前襟短袖翻领衬衫和长裤，分别采用原版、侧视已有的最佳局部修订，制作对应配色。开放式外套未冒充同款衬衫。
- 女版侧视采用已有短袖上衣／短裙。原版缺少对应短袖结构，因此新增八个参考姿势的绘画原稿，只提取衣料；生成的脸、皮肤、鞋子和背景全部舍弃。
- 八个女版绘画姿势用于选型；最终采用同一张站姿衣料，躯干与双侧袖子分别定位，裙摆保留连续的绘画褶皱布局，再随原姿势调整，避免不同原稿切换造成纹理跳变。补绘衣料属于新美术，不是从原视频准确提取的隐藏图层。
- 两种视角独立登记来源、定位、遮挡和衣料哈希。衣服可以在自身声明的区域内改变轮廓，区域之外的原片像素保持不变。

素材来源、拒绝的试验和原生预览分别见 [男版](../../artwork/dual-tailored/male/README.md) 与 [女版](../../artwork/dual-tailored/female/README.md)。最终展示以实际应用导出为准；离线预览不代替界面流程验收。

## 可复用的定位标准

每种人物、视角、来源修订都有独立配置。沿用登记中的 17 个锚点，并保留其可见性、估计方式和置信信息；这些是原生帧定位参考，不声称是视频的真实骨骼。

| 服装部位 | 定位依据 | 还需逐姿势检查的内容 |
| --- | --- | --- |
| 领口 | 颈部点、实际原片领口、肩点 | 原片模糊边缘、领口与下巴间距 |
| 肩袖 | 近／远肩点、上臂轴线 | 袖山体积、抬臂后腋下覆盖 |
| 袖口 | 肘部方向、绘制的袖口边缘 | 袖口厚度、前臂前后遮挡 |
| 腰线 | 左右腰点、实际衣料边界 | 下蹲压缩、上衣和下装的重叠 |
| 裤腿 | 髋、膝、踝点 | 屈膝体积、鞋与裤脚接触 |
| 裙摆 | 腰线、膝盖相对位置、绘制的下摆 | 跑跳抬升、腿部遮挡、相邻帧轮廓 |

锚点能帮助定位，不会自动生成缺失的袖子、背面、裙褶或遮挡部分。女版上衣最终采用实际原片背心轮廓拟合，避免下蹲时不准确的颈部估计把领口拉到脸上，原定位保持不变。

男版原版跑步的原生帧 ID 54（视频源帧索引 143）的手部遮罩误含脚踝，令长裤留下三角缺口。本轮新增独立定位版本，只移除这一误圈的 1,133 像素保护区域，保留实际手掌和其他帧；并用原有裤料补齐局部、清理假缺口描边。旧定位与旧服装包均未改写。解剖定位对比见 [手与脚踝标注](../../artwork/dual-tailored/male/ankle-review/source-hand-ankle-diagnostic.png)，最终裤脚效果以实际导出比较为准。

女版也发现 6 个走路／跑步姿势的手部标注误含大腿或脚踝，新款使用独立修订。走路片段另统一处理前景归属：可见前臂在手腕处结束，被遮住的远侧手臂不会把腰线以下的大腿当作前景。裙侧根据原片短裤轮廓有界补足，抬起的鞋子另有前景遮挡。

放大实际导出后，又发现 8 帧的拇指、斜向手腕或拳头底缘超出了已有保护范围。新增按原片描出的手部边界，将误盖皮肤的上衣／裙料归属移除，恢复该区域的原片像素；不把拳头下方的大腿一起保留。修正同时覆盖上衣和裙子，旧定位保持原样。标注只是起点，扩展裙装等新轮廓时仍需检查原片中实际可见的身体部位，不能仅凭已有保护区测试判断无穿插。

## 工程与导出兼容性

双视角工程继续使用 V1 外层 ZIP，以及原有的两份原生换装工程。新服装组使用各自审阅过的定位，只有两边都准备并校验成功才应用。导入损坏、来源不匹配或资源缺失时保留当前两边搭配。

旧棉质工程、旧衣料和旧默认行为保持可用。换装后的当前视角仍可导出 PNG、GIF 和标准 CharacterPack，独立播放器不需要服装编辑器。

保存过的发型、表情若绑定另一套定位，切换服装组会明确拒绝自动迁移并保留工程；本轮没有重绑定这些资产。侧视仍没有庆祝素材，原来的连续两跳仍作为一次动作播放。

## 验收记录

本轮功能检查、实际导出与视觉限制见 [verification.md](verification.md)。不能把单元测试通过视为接缝已经消失，也不能把两段不同源视频描述为相同光照、相同画幅或相同动作相位。

## 重建

离线绘画脚本需要 Python 的 Pillow、NumPy 和 SciPy；浏览器构建需要仓库的 Node 依赖和 Chromium。
本轮重建环境为 Python 3.12.14、Pillow 12.3.0、NumPy 2.3.5、SciPy 1.17.0，以及 Node 24.19.0。

```sh
python scripts/prepare-dual-tailored-male-cuff.py --output docs/dual-tailored/assets/male
node scripts/build-dual-tailored-male.mjs
python scripts/build-dual-tailored-female.py --output docs/dual-tailored/assets/female
node scripts/build-dual-tailored-female.mjs
node scripts/assemble-dual-tailored-catalog.mjs
```

男／女材质构建器使用相同的现有本地服装处理引擎，生成后可用 `--check` 逐字节验证。绘画原稿已保存，重建不调用生成服务。浏览器运行和播放也不调用绘图 API。
