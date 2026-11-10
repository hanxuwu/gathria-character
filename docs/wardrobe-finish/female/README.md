# 女版领口与连续性复核

本次在上一轮覆盖修订上继续关闭领口和肩带的明确灰背心残块。
**30 个原视角上衣／连衣裙包、180 个服装帧，新增 36,798 个衣料覆盖像素**；每件仅改变 89、90、93、101、102、103 六个姿势。
旧 owned 衣料像素与其余 90 个姿势保持原值，源人物、脸、身体比例、动作顺序、24 FPS、锚点和共享关节配置不变。

## 精确修改范围

六个原尺寸裁切区经过源图和换装图复核。只纳入不透明、明确中性的原背心衣料，并保留暖色皮肤与深色内领描边；规则仅用于离线提案，运行时使用冻结像素行，不能对其他图像自动放行。
新增位置用本件衣物、同帧相邻布料的颜色比例延续原衣料明暗；没有生成新人物，也没有对脸、身体或源动画作变形／重定位。

- [原图、旧换装与新增衣料区域](source-cloth-review-native-3x.png)
- [实际合成器同帧前后图](plum-neck-before-after-native-3x.png)
- [精确修订记录与可逆原值哈希](repair-report.json)
- [源文件、衣料行与不可变 V2 权限](../../../artwork/wardrobe-finish/female/neckline-review-v2.json)

V2 审核在两个原视角绑定中各增加 **318 个位于旧 head 保护内的明确衣料像素**；其他新增衣料已经在 head 保护之外。旧 V1 文件、ID、SHA 和旧存档的权限不变。新衣物明确选择 V2，旧衣物不会因加载新版程序而得到扩大权限。

## 连续播放与实际导出

- [三套跑步：右](female-three-looks-run-before-after-right.gif) · [左](female-three-looks-run-before-after-left.gif)
- [三套跳跃：右](female-three-looks-jump-before-after-right.gif) · [左](female-three-looks-jump-before-after-left.gif)
- [实际合成器、保存重开与独立包验证](runtime-verification.json)
- [预览帧序、时长与哈希](presentation.json)

GIF 左右相邻两列分别为 before/after。预览使用固定画布和统一调色板，未逐帧重新居中；重复播放便于审查，原 jump 仍为非循环。PNG 与项目保留原生 RGBA；GIF 的 256 色和 10 ms 时间刻度只属于预览。
可编辑项目和独立 CharacterPack 已实际生成，保存在本地 `/tmp/wardrobe-finish/female/downloads`；这里记录哈希，不重复提交整份人物源数据。

## 侧视复核与边界

[91–95 领口源图／实际换装邻帧](side-neck-neighbors-native-2x.png)中未见当前奶油领口内的大块原灰背心残留；细暗描边、源颈部阴影和部分混合柔边仍保守保留，[结论](side-neck-review.json)只覆盖该区间。

全素材时序扫描还定位了侧视 walk 20→21→22 的衬衫骤窄，以及 run 37→38 的裙摆突短。源图／换装邻帧复核确认它们属于衣物定位跳变，已交由本轮侧视连续性修订单独处理；不能把这些异常解释成自然遮挡，也不能用本文件的原视角修复宣称侧视已经通过。

最终复核确认：90/102 仍能看见旧背心领口的肤色／衣料混色残边和阶梯边，不能全部解释为自然颈部阴影。
例如 90 帧原尺寸 `(400,569)` 的 RGB `(189,157,139)`、102 帧 `(400,600)` 的 `(198,170,149)` 仍来自原图；下方明确衣料已经换色。
见[原图／当前／覆盖范围对照](neckline-90-102-source-vs-current-4x.png)与[只读核对记录](neckline-90-102-readonly.json)。
这些已经混入肤色的柔边需要进一步局部补绘；直接放宽颜色阈值可能侵入脖子。本次关闭明确衣料缺口，没有做到所有领口完全无旧色残留，也不宣称达到逐帧手绘质量。

## 复现和兼容验证

`python scripts/finish-female-neckline-coverage.py` 从冻结的 `2a720798` 衣物基线生成 `/tmp/wardrobe-finish/female/candidate` 候选；它不会默认覆盖当前发布资产。

`node scripts/review-female-neckline-finish.mjs` 用实际运行时检查全部 30 个候选的 2,880 帧，并为 plum、日常裙、婚礼裙生成前后图，保存重开和独立导出。

`python scripts/present-female-neckline-finish.py` 将实际合成结果整理为上述 GIF 和原生像素放大图。

旧 CI 无需下载未合并的基线来放宽断言：`scripts/wardrobe_finish_audit.py` 先验证新的冻结 manifest、精确 after patch／ownership 哈希，将明确新增的原透明位置还原，再验证 before 哈希。原有历史修复检查继续对还原后的上一层运行。五个负例测试覆盖额外 RGB、ownership 和权限改动均被拒绝。
