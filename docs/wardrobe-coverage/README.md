# 服装覆盖检查

本轮围绕「衣服没有盖住原背心、原短裤或应当包住的手臂」检查当前衣橱。
原人物的脸、身体、帧顺序、动作速度和两种视角的源图均保留。

本页保留上一轮覆盖修订的历史记录。后续袖口、领口与侧视连续性修复、当前素材验收和工作台检查入口见[接缝修订](../wardrobe-finish/README.md)；本页旧 GIF 与审计记录没有替换成新图。

## 范围

[可复现清单](inventory.json)覆盖当前界面的 113 个独立服装 ZIP、10,903 个服装与原生帧组合。
包括男女原视角、侧视、双视角搭配的全部可选旧款与配色，以及男版落地实验候选。
同一文件被多个入口引用时只计一次。未被当前目录引用的历史或制作过程服装包、历史导出和用户自己上传的项目不算作本轮通过的素材；具体清单与数量以 inventory.json 为准。

检查分成三层，结论不能互相替代：

1. 全量核对来源、关节配置、服装哈希、动作帧完整性。
2. 用实际合成器逐帧渲染，并对源衣料、服装覆盖范围、手部和领口边界做像素检查。
3. 放大查看疑似区域和困难姿势，核对同帧前后图及连续 GIF。

皮肤颜色本身不代表穿帮。短袖的前臂、裙外的腿、领口、手和原视频中带粉色的鞋底均需按原图判断。
透明空洞检查也不够：漏出的灰背心或短裤仍是不透明像素，旧检查会放过这些问题。

## 修复方式

- 对漏出的原衣料，扩大当前衣物的局部覆盖范围，使用同件衣物已有的相邻绘制纹理。
- 对把前臂或衣料误圈进去的手部保护区域，保存该件服装、该帧专用的审核边界。头部和共享关节配置保持不变。
- 对头部保护范围内的女版原背心，仅允许[审核过且严格绑定源文件的衣料像素](neckline.md)被上衣覆盖。真实脸部、脖子和手仍保留。
- 对男版侧视西装，袖子补用已有绘制服装的布料；原手指和拳头轮廓保留。

这是服装资产的覆盖修订。它没有重画人物、改变动作节奏，也没有把自动检测结果当作美术验收。
旧保存项目仍保留其中嵌入的旧素材；新建内置服装项目可查看这次更新。

## 本轮结果与动画

87 个当前可选服装包更新，26 个保持原字节。五份人物源文件、十份关节配置及所有服装帧 ID 保持不变，见 [保留范围核对](preservation.json)。

| 分组 | 本轮覆盖修订 | 实际审阅 |
| --- | --- | --- |
| 男版原视角 | 27 件上衣，五帧拳头边的灰背心残留；每件仅改 305 个确认的衣料像素 | [说明](../kling-coverage/review/original-male/README.md) · [跳跃 GIF](../kling-coverage/review/original-male/original-male-jump-before-after-right.gif) |
| 女版原视角 | 34 个包，交叉手臂下的背心、领口衣料、腰间短裤缺口 | [说明](original-female/README.md) · [三套跳跃 GIF](original-female/female-jump-three-looks-before-after-right.gif) |
| 男女侧视 | 22 个包，衬衫腋下、领口、握拳旁裤装／裙装；恢复一处被裤子误盖的鞋底 | [说明与 12 个左右 GIF](side/README.md) · [女版跳跃](side/review/female-jump-before-after-right.gif) |
| 男版落地候选 | 四个包同步覆盖修订；西装按实际拳头边界补齐前臂长袖 | [说明](landing/README.md) · [西装跑跳前后](landing/review/wedding-run-jump-before-after-right.gif) |

GIF 中 Before 在左、After 在右。它们是审阅用循环；单次跳跃、跑跳衔接和原生动作数据没有因此被改为连续跳跃。
缩略图也重新经过实际渲染核对：[47 套待机图与原 PNG 完全相同](thumbnail-revalidation.json)，只更新了素材版本绑定。

仍需注意的美术问题：原视频的少量灰绿柔边、保守保留的一像素衣料／皮肤边界，以及部分侧视袖口和折痕偏硬。
这次修复了明确的覆盖缺口，没有宣称所有动作已经毫无视觉瑕疵。

## 复核

[技术检查汇总](validation-summary.json)记录本轮测试范围；[全量实际渲染](runtime.json)覆盖 10,903 个服装帧和 8,437 个预设帧。
运行记录绑定[当时的清单快照](runtime-inventory.json)。`inventory.json` 跟随当前可选目录更新；后续接缝修订已更新其中部分衣物，不能把本页旧运行结果当作新版素材的验证。当前验证见[接缝与混搭验收](../wardrobe-finish/README.md)。
落地候选另有[实际工作台保存／导出](landing/review/actual-workbench-review.json)与[独立播放器逐帧一致性验证](landing/review/standalone-player-review.json)。

```sh
python scripts/build-wardrobe-neckline-profiles.py --check
python scripts/refresh-wardrobe-coverage-catalogs.py --check
python scripts/inventory-wardrobe-coverage.py --check
node scripts/verify-wardrobe-coverage-runtime.mjs
```

最后一项检查所有服装和已声明搭配的全部原生帧；每个素材分组还检查最后一套预设的保存重开。
它不等于穷举任意混搭的保存重开，也不等于已经消除所有视觉瑕疵。
逐件修复配方、审阅图、GIF 和仍需注意的边界分别保留在本目录及链接的原视角检查目录。
