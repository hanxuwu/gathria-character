# 服装接缝、连续性与完整流程修订

本轮修正已有 Kling 服装的困难姿势，并把对应检查位置放进现有工作台。
当前 113 个可选服装包中，45 个更新、68 个保持原字节；人物源图、动作节奏和共享锚点保持不变。
技术验证和美术判断分别记录，以下 GIF 与原尺寸对比才是观察接缝改善的依据。

## 先看画面

| 部位 | 实际改动 | 查看 |
| --- | --- | --- |
| 男版西装 | 16 帧弯曲袖口、20 帧前襟布料映射，共 27 个不同姿势；保留原拳头与身体倾斜 | [单跳前后 GIF](male/wedding-single-jump-before-after-right.gif)、[袖口](male/cuffs-native-2x.png)、[前襟](male/waistcoat-native-2x.png) |
| 女版原视角领口 | 30 个上衣／连衣裙包，在 6 个姿势补齐明确残留的灰背心衣料 | [三套跳跃 GIF](female/female-three-looks-jump-before-after-right.gif)、[同帧领口](female/plum-neck-before-after-native-3x.png) |
| 女版侧视走跑 | 14 个包修正 walk21、run38/39 的服装专用腰线，避免袖体骤窄、裙腰突升 | [走路前后 GIF](side/review/polished-female-side-apricot-walk-right.gif)、[跑步前后 GIF](side/review/polished-female-side-apricot-run-right.gif)、[连续原生帧](side/review/run-native-cloth-neighbors.png) |

各专题还提供反向 GIF、准确帧数和时间：[男版](male/README.md)、[女版领口](female/README.md)、[侧视连续性](side/README.md)。
男版落地候选还经过[实际工作台跑跳导出与独立播放器验证](landing/README.md)。
同一对比使用相同源帧、位置和动作时间；没有逐帧重新居中或调整头身比例。
GIF 为审阅而重复播放一次完整跳跃，角色包中的基本 Jump 仍只执行一次。

## 在工作台检查

1. 原视角打开 `/workbench.html?character=female&mode=wardrobe`，点击 **Open look review**。
2. 侧视打开 `/workbench.html?character=female&mode=side-view&collection=tailored`，点击 **检查穿帮 · 逐帧审阅**。
3. 在 **已记录的覆盖检查点** 中选择领口、交叉手臂、下蹲腰线或袖口，暂停查看原人物／当前换装的同一帧。
4. 放大局部，并可勾选 **显示服装覆盖区域**。青色表示服装绘制范围，粉色表示清除旧衣的透明替换范围。
5. **下载本帧 PNG（无标记）** 输出完整透明人物；局部裁切、放大和覆盖色不会写进 PNG、GIF 或人物包。

检查点按确切来源绑定，不能把同一帧编号套给其他人物。它们是复核位置，不是自动穿帮告警或美术通过标签。
男版新袖口可在 `character=male&mode=side-view&collection=landing-candidate` 查看。
完整说明与实际页面见 [UI 验证](ui/README.md)。

## 存档和导出兼容

修正了旧双视角项目因服装目录更新而不能打开的问题。旧项目继续使用其内嵌服装；新建项目使用当前修订。
兼容注册表绑定人物、视角、服装身份、调色、源图、锚点和确切 ZIP 哈希，未知修改不会借用旧版本身份通过。
原 V1 领口审核规则仍保持原义，新修订的服装明确使用独立 V2 规则。
同时修复遮罩编辑器把 V2 衣物默认降回 V1 的问题：继续编辑时保留衣物内嵌的有效审核规则；旧衣物不会因此自动获得新权限。

历史导出继续核对历史像素，当前导出则独立重组已审核的源图、衣物和外观层；没有把原失败参考图整体更新成新图。
详见 [浏览器回归与历史兼容](browser-regressions.md)、[动作导出核验](motion-regression/README.md)。

## 验收范围

- [最终验证汇总](validation-summary.json)：815 项单测通过；完整浏览器运行 181 项通过、1 项资源准备等待超时，该等待修正后定向复测通过。保留首次失败与复测记录，不把它写成首次全套零失败。
- [源图与锚点保持记录](preservation.json)：5 个源包、10 个共享定位文件、2 份旧领口权限文件逐字节不变；113 个服装的身份、绑定、尺寸和原生帧序不变。
- [混搭与时序验收](mixed/README.md)：按上衣和下装轮廓选择风险组合，对完整原生帧运行实际合成；代表组合再保存重开并独立导出。
- 时序指标用于寻找需要查看的相邻帧，不会把分数低当成没有穿帮。未执行的具体组合在计划中列出。
- 每层修订都有固定前后像素证据；旧覆盖检查先验证并剥离本层，再继续核对历史断言。

当前仍有女版极端姿势的旧领口混色边、部分较硬衣褶、原视角马甲 run62/63 的前臂遮挡边，以及侧视 walk23／run40 更换衣料原稿后的袖形差异。
本轮对上述明确问题有局部改善，不能据此承诺任意发型、表情与衣服组合都达到逐帧手绘质量。
按具体帧列出的未完成美术项见[最终目视复核](mixed/visual-review.json)。
