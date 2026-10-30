# 双视角同款发型修订

上一版完整造型把原版的男侧分、女短波波，与侧视的短碎发、较长波波配在一起。名称相同，实际剪裁不同；并排 GIF 又按相同原生倍率展示了分辨率不同的人物，使侧视明显偏小。

本次以原版 `side-part` 和 `soft-bob` 为造型基准，重新绘制对应的侧视头发。男版保留宽发束、侧分和前额蓬松翻翘；女版保留紧凑圆润的耳侧短波波。原版外观包不变。生成原稿中的脸、耳朵、脖子和衣服全部舍弃，只取经过审阅的头发区域；不是把生成的新人物盖到 Kling 原片上。

## 从哪里看

首页人物卡片 **编辑人物 → 双视角衣橱 → 应用完整日常造型**。再用 **人物素材** 切换原版／侧视，用 **头发与表情** 切换发色、表情或恢复原片头部。

直达：`/workbench.html?character=male&mode=paired` 或 `?character=female&mode=paired`。

旧工程仍使用工程内嵌素材，会显示为已保存的自定义外观。点击 **替换为配对发型与表情** 可升级头部并保留已有混搭；**应用完整日常造型** 会连衣服一起重选整套搭配。此次没有替换独立侧视试装工具中的旧发型，也没有修改默认棉质搭配。

## 实际导出对比

| 人物 | 原版母版／旧侧视／新侧视 | 等身高双视角 | 同帧侧视前后 |
| --- | --- | --- | --- |
| 男版 | [头部对比](review/male-matched-heads.png) · [站姿](review/male-matched-stance.png) | [跑步右](review/male-two-views-run-right.gif) · [跑步左](review/male-two-views-run-left.gif) · [走路](review/male-two-views-walk-right.gif) · [跳跃](review/male-two-views-jump-right.gif) | [跑步](review/male-side-run-before-after.gif) · [跳跃](review/male-side-jump-before-after.gif) |
| 女版 | [头部对比](review/female-matched-heads.png) · [站姿](review/female-matched-stance.png) | [跑步右](review/female-two-views-run-right.gif) · [跑步左](review/female-two-views-run-left.gif) · [走路](review/female-two-views-walk-right.gif) · [跳跃](review/female-two-views-jump-right.gif) | [跑步](review/female-side-run-before-after.gif) · [跳跃](review/female-side-jump-before-after.gif) |

比较图读取应用导出，加展示底色和标签。每个视角按原片站姿确定一次等比倍率及鞋底基线，整个动作不再逐帧缩放或重新居中。原生 PNG、包内尺寸和锚点不变。两份跑步按各自时钟播放完整六秒共同周期；跳跃是非循环原片，两侧按各自时长完成。完整规则见 [presentation.md](presentation.md)。

## 分层与兼容

- 新侧视款为 `side-part-matched-v1`、`soft-bob-matched-v1`。分别绑定原有 107、102 个原生姿势，使用冻结的源头部定位变换。女版耳洞周围的头发采用连续局部变形，跟随已有耳颈定位，避免下蹲时头顶放大带着耳洞一起变大；不重新估计脸型或伸缩原人物。
- 后颅覆盖发块、前额与鬓角属于前发；真正的后颈发尾和远侧发束属于后发。避免把全部头发合并后再用耳底一条水平线裁分。
- 男版跳跃 67／79 的后脑超出发片覆盖范围，局部移动既有后发纹理补齐；相邻 66／68、78／80 使用较小权重过渡，不改原人物或整顶头发的大小。
- 保留 `headBounds`、面部保护区、源帧及全部身体锚点；增加随已有面部变换移动的颈部前景保护，阻止发尾覆盖领口。女版旧侧视跳跃 77 的孤立棕色片属于本次修复范围。抬臂半透明边缘下方补充同源后发，避免保护区裁掉前发后留下白线。
- 既有 `gentle-side-v1` 表情逐帧保留。原版两个素材包、衣料包、动作帧序、时长、循环标记及导出格式保持不变。
- 新素材保存在独立目录；旧 V1/V2 工程继续保存和重开自己的嵌入内容。普通服装或配色切换不触发头发迁移。

这仍是二维侧视补绘，不能等同于从三维模型精确旋转得到的另一个视角。原片自己的头部形变、模糊和少量绿幕边缘继续保留；头发没有新增惯性模拟。

女侧跳跃 95 仍有细肤色斜线：旧手部保护区把一小段不透明后脑皮肤误归为手部，后发无法遮住它。这是尚未修正的遮挡归属问题，不应解释为正常发束或原片白线。男侧跳跃 82 的前肩切口、女侧跳跃 97 的前臂衣料碎片，以及女版短发露出的旧上衣后肩台阶，属于已有服装限制，本次没有改动衣服来掩盖它们。最终局部对比与范围见验收记录，不能将功能通过理解为所有困难姿势已无穿帮。

功能与美术检查分开记录于 [verification.md](verification.md)。原稿、遮挡边界与逐帧绑定记录在 [artwork/matched-hair](../../artwork/matched-hair/)。此前证据仍位于 [docs/dual-looks](../dual-looks/README.md)。
