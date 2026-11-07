# 男版落地接跑：三套造型候选

最新候选已进入 [V3 落地恢复与 GIF 循环修正](../kling-landing-contact/README.md)。本页保留 V1/V2 的补绘、袖口和旧版导出审阅记录；`assets/` 随最新候选更新，历史 GIF 仍对应各自发布时的动作路径。

这是独立的实验候选，**尚未通过美术验收，不替换男版 V7、女版 V6 或现有默认人物**。目标是让落地后抬腿的变化更连续，并让原人物、日常装和西装使用同一组身体过渡姿态。

在本地应用打开：

```text
/workbench.html?character=male&mode=side-view&collection=landing-candidate
```

人物库提供明确标注的实验入口。候选里可切换原人物、日常装和西装，播放“跑 → 跳 → 跑”，也可在两张新增落地姿态暂停、保存项目并重新打开。基本 Jump 仍只跳一次。现有工作台入口和旧项目继续使用原来的动作配置。

先看实际导出：[三套造型向右](review/three-looks-run-jump-run-right.gif) · [向左](review/three-looks-run-jump-run-left.gif) · [落地逐帧对比](review/three-looks-landing-contact.png)。GIF 循环的是整段演示，每轮只有一次跳跃。

本次第二版的同速前后对比：[原人物](review/original-before-after-right.gif) · [日常装](review/daily-before-after-right.gif) · [西装](review/wedding-before-after-right.gif)。两侧使用相同帧数和时钟；另有明确标注为三倍慢放的落地局部，方便检查接缝。

完整 GIF 是演示片段重复播放，结尾回到开头会重置跑步相位（47 → 39），不是无缝循环动画。判断落地衔接请观察中段；交互播放器在落地后继续原生跑步循环。

## 第二版局部修正

- 第 108 帧的近侧手臂和胸部重新局部补绘，让它提前向原片 Run48 的摆臂方向过渡。遮罩外像素不变，头部、腿、鞋和远侧手继续使用第一版原像素；第 107 帧完全保留。
- 对应重做第 108 帧日常装和西装的袖口、衣身覆盖和手部保护。第 107 帧服装保持不变。
- 西装原有的 16 张困难姿势（63–66、74–80、97–101）换用新补绘的抬臂布料，改善方形袖口和僵硬折痕。第 78 帧另补齐 32 个被误判为皮肤的衣身内孔像素。其余原有上衣帧及原有裤装像素保持不变。
- 原片帧、动作顺序、24 FPS 和 700 px/s 检查速度均未改变。改善来自局部画面修正，支撑脚剩余的轻微位移仍需单独处理。
- 第二版拥有独立源哈希、定位哈希和动作配置。已有第一版自包含项目保留自己的素材和播放状态；新开候选入口使用第二版。服装 ID 保持稳定，但不同源版本的服装银行不能交叉绑定。

新补绘只用于这个实验候选。生成稿、最终像素遮罩和补绘来源见 [第二版原稿目录](../../artwork/kling-landing-production/body/revision-2/)；[跨版本检查](checks/edition-v1-v2.json)记录逐帧保留范围。

## 本轮具体改动

- 在原来的 107 张侧视源帧后追加 107、108 两张身体补绘。原来的三张图集、所有原帧位置和源动作声明保留原字节/数据。
- 两张新身体穿灰背心、深色短裤和白鞋。日常装与西装通过各自独立的服装层覆盖，身体动作共用。
- 头部从原片第 89 帧逐像素复制，只做整数位移：`(-9,-7)`、`(-18,-14)`。每帧保留 37,158 个可见头部/颈部像素，没有重新生成脸、缩放头部或混合脸部图像。
- 新帧手部保护区和 17 个服装定位点人工标注。被遮挡的关节点明确标为估计值；这些点不是从视频恢复出的真实骨骼。
- 独立动作配置严格绑定候选源 ZIP 哈希和角色 ID。落地接跑使用 `88 → 89 → 107 → 108 → Run48`；新增两帧在 24 FPS 下共增加约 83.33 ms。没有减慢原生跑步节奏、变形原帧或调低移动速度来掩盖滑步。
- 保存项目可记录当前动作时钟、过渡时钟、方向、位移、暂停和待处理动作。重新打开新增过渡帧可从同一时刻继续；不匹配源素材的检查点会被拒绝。

## 资产与复现

- [输入与补绘来源](../../artwork/kling-landing-production/body/art-provenance.json)
- [当前人工定位点](assets/male.registration.json)
- [当前头部像素复制审计](../../artwork/kling-landing-production/body/revision-2/head-copy-audit.json)
- [候选资产目录与绑定](assets/catalog.json)
- [运行时验证](assets/runtime-verification.json)
- [实际工作台下载与保存重开记录](review/actual-workbench-review.json)
- [独立播放器验收](review/standalone-player-review.json)
- [旧版项目和导出的兼容检查](review/v1-backward-compatibility.json)
- [第二版独立视觉检查](review/visual-review-v2.md)
- [支撑脚人工测量](review/foot-anchor-review.json)

新身体和西装纹理属于生成、补绘与适配资产，不是原视频中准确提取的隐藏图层。原始生成稿、提示词、定位参考和选择理由保存在 `artwork/kling-landing-production/`。

构建入口为 `scripts/build-landing-production-assets.py`，输入文件为 `artwork/kling-landing-production/body/inputs.json`；`--source-only` 与完整构建生成相同的源 ZIP。TypeScript 配套验证器使用实际项目读取器、合成器和保存格式检查产物。日常装与西装适配脚本单独保留，避免依赖一次性的编辑器状态。

独立导出仍使用现有 CharacterPack V3。原人物导出保留四页图集；换装导出沿用现有打包器，整理为两页图集，109 帧和候选动作配置完整保留。三份包都已在新的独立播放器会话中实际执行跑→跳→跑，观察到两张新增帧，重新导出的 ZIP 字节一致。

## 如何审阅

先按正常速度看左右方向的完整 GIF，再观察落地局部。用“横向移动”在 700 px/s 下检查脚与地面参考线的关系；原地 GIF 无法证明没有滑步。新增姿态能被技术检查读取，也不代表衣领、肩袖和动作节奏已经合格。

实际工作台导出的 GIF、两张过渡帧 PNG 和界面截图位于 `review/`。三套造型的 wardrobe ZIP 和独立 CharacterPack 均实际下载、验证并记录哈希；为避免重复提交相同图集，验证用 ZIP 保留在执行目录 `/tmp/landing-production/ui-review-v2/`，仓库保存源资产和可复现步骤。需要文件时可在候选工作台点“保存项目”或“CharacterPack”。`*-actual-travel.webm` 是实际画布播放记录，包含横向移动参考。

若当前会话已经导入第一版项目，重新点候选入口会继续该项目，避免丢失工作。另开页面进入上述地址即可查看最新第二版。

日常上衣＋西装裤、西装上衣＋日常裤两种混搭也已实际导出 GIF、保存并在第 108 帧重开，记录见 [混搭验证](review/actual-mixed-review.json)。测试与美术状态汇总见 [validation-summary.json](review/validation-summary.json)。

## 美术验收边界

本轮消除了补绘初稿中支撑脚先过度后移、再反向弹回的问题。人工测量得到支撑鞋中心约 `285 → 264 → 234 → 215 px`；在 700 px/s、24 FPS 下仍有约 8–10 px 的局部地面相对位移，鞋底高度也有数像素变化。测量本身约有 ±4 px 误差，不能宣称精确锁脚。

新身体的阴影、手部轮廓与原片仍有差异。第二版已改善上述抬臂西装袖形，但个别原片保护区旁仍可看到很小的肩颈皮肤边，袖口露出长度也会变化。技术结果与美术结论分别记录；在确认三套造型的连续画面前，不将这个候选提升为默认版本。女版过渡补绘不在本轮范围内。
