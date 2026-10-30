# 双视角完整人物：服装局部复核

本轮从 `b2feaea` 的实际应用导出开始审阅男版领口、肩袖、下蹲腰线，以及女版原版／侧视的走路、跑步和跳跃。旧日常组的 16 个衣料包、源视频帧、定位文件及其默认选择均保留。

## 接受的两处女版侧视修正

| 原生帧 ID | 问题与实际原因 | 处理 | 修改范围 |
| --- | --- | --- | --- |
| 32 / walk | 裙子右前片内有一个小的透明衣料缺口，露出腿部；它不是手臂前景，也不在头／手保护中 | 仅使用 4 像素距离内已有的不透明裙料补齐这个明确的小连通区域 | 33 像素，`[292,581,300,590]` |
| 92 / jump | 衣料上前缘依据原短裤顶边裁切，经过抬起膝盖时扣掉一块矩形区域；`waist + 24` 截止造成明显直角 | 恢复同一已绘制裙子在裁切之前的原始采样，继续使用原合成规则 | 315 像素，`[253,382,270,405]` |

这不是补画人物皮肤：裙子现在覆盖原本就应被该裙片覆盖的小区域。旧衣料所有已拥有的 RGBA 像素完全不变，保护区无变化，其余 100 个侧视裙子姿势逐像素不变，整套上衣不变。第 32 帧有 3 个最终 alpha 像素变化，全部位于审阅的小缺口范围内；不把全图 alpha 不变当作该轮廓修正的前提。

这里的原生 ID 32／92 分别对应侧视源视频帧索引 58／240，不能把两套编号混用。

第 92 帧的原衣料 donor alpha 为 253，脚本保留它与原片的既有 source-over 计算，未把它虚称为全不透明源画。恢复的是原来的裙褶采样，不是纯色矩形或新画出的几何块。

- [32：原片／实际导出基线／离线候选，2 倍](female-side-32-candidate-2x.png)
- [92：原片／实际导出基线／离线候选，2 倍](female-side-92-candidate-2x.png)
- [31–33 相邻原生姿势](female-side-32-neighbors-native.png)
- [91–93 相邻原生姿势](female-side-92-neighbors-native.png)
- [种子衣料逐帧审计](audit.json)
- [两套配色的独立像素对比](palette-preservation.json)

这些候选图只作局部美术审阅。最终验收仍需使用工作台真正导出的 PNG、GIF、CharacterPack；本目录不把离线候选图冒充实际下载文件。

## 没有继续修改的部分

男版原版领口与抬臂袖子中的硬折痕来自已绘制衣料及其压缩采样，未找到可以只修归属就自然改善的独立缺口。侧视灰色肩颈边界还混合原片模糊肤色；此前扩大覆盖的方案会伤及身体，不能再次通过放宽保护处理。本轮保留当前男版衣料，不把旧修订算作新增改善。

女版侧视跳跃的外侧裙缘仍有由相同裁切截止造成的小台阶，尤其原生 ID 79–85。将它整体改成新的连续外缘会改变更多姿势的裙子体积，未混入这次两处内部缺口修正。女版原版 run 56–61、jump 95–105 的远侧腰片还有拟合感，原版 105 上衣腰部暗边也偏厚；本轮保留上一轮已验证的手部和裙摆成果。

## 可复现流程

```sh
python scripts/prepare-dual-looks-cloth.py
python scripts/prepare-dual-looks-cloth.py --publish
node scripts/build-dual-looks-cloth.mjs
python scripts/prepare-dual-looks-cloth.py --check
node scripts/build-dual-looks-cloth.mjs --check
python scripts/prepare-dual-looks-cloth.py --verify-palettes
```

第一条只生成候选图。`--publish` 明确写入独立的新裙子种子，不覆盖旧包。两个 `--check` 分别验证种子与四个配色包逐字节重建；最后一条独立解码前后衣料，确认所有旧衣料像素不变、两种配色仅第 32／92 帧有所改变。配色构建还检查 816 个原生混搭姿势（102 帧 × 两种配色 × 四种上／下装选择）。

新种子：`docs/dual-looks-cloth/assets/female-side-skirt-reviewed.garment.zip`。新四个配色包及目录：`docs/dual-looks-cloth/assets/female/`。它们属于独立的 `complete-day` 逻辑组，旧 `tailored-day` 保存结果保持原绑定。
