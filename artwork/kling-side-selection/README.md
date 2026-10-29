# Kling 侧视动作候选：来源与处理

本批保留上传视频中的原画，只选择连续动作区间并做透明化和固定尺寸配准。
它是独立审阅候选，不替换默认人物，也不接入旧服装遮罩。

## 可重现输入

- `source/*.mp4`：用户上传的七段原始视频，未经转码。
- [selection.json](selection.json)：每段视频的原文件名、SHA-256、抠像参数，以及每个动作的来源和帧区间。
- 帧编号从 0 开始，`endExclusive` 不包含结束帧。所有输入为 1920×1080、24 fps。
- 本批没有补画、生成新图、插帧、倒放、时间拉伸或骨骼变形。

## 处理规则

1. 校验原视频 SHA-256，由 FFmpeg 解码指定的连续原始帧。
2. 根据相对绿色分量生成 alpha，保留主体及 3 源像素的边缘余量；仅清除余量外的小型孤立残点。若实际删除的连通块超过 32 个像素则中止并要求检查。半透明边缘去绿溢色；完全不透明区域在缩放前保持原始 RGB。
3. 每段视频只从第 0 帧站姿计算**一次**整体等比缩放和平移：站姿高度 480 px，固定画布 512×768，脚底参考点 `(256,710)`。不逐帧居中、不改变身体部件比例。输入视频的起伏、位移、跳跃高度和造型漂移都保留。
4. 采用预乘 alpha 的双三次重采样，避免透明边缘变黑。配准后像素经过采样，不能称为与原视频逐像素相同。检测配准后是否裁切。
5. 将原始连续帧写入现有 CharacterPack V3：男版 174 帧、女版 171 帧，各 4 张 RGBA PNG atlas，原始 24 fps。回读包内全部帧，与配准后的透明 PNG 逐像素核对。
6. 左朝向使用既有播放器的水平镜像；这是镜像结果，不是视频提供的另一侧原画。

## 重建

需要 Python 3、NumPy、Pillow、SciPy、FFmpeg/FFprobe；浏览器验证使用项目已有 Node 依赖及 Chromium。

```sh
npm ci
python scripts/prepare-kling-side-selection.py
python scripts/render-kling-side-selection.py
EVIDENCE_PHASE=browser-recheck node scripts/verify-kling-side-selection.mjs
```

提取和渲染命令会更新本批派生文件；浏览器验证拒绝覆盖已有证据目录。临时源帧放在系统临时目录。输出及完整限制见 [交付说明](../../docs/kling-side-selection/README.md)。

现有衣服与发型绑定旧人物帧，不能因为新包能够播放就宣称可直接换装。本批没有改变任何产品运行时代码、默认配置或旧素材。
