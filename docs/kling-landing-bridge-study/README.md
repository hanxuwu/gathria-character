# 落地接跑补绘试验：独立候选，尚未通过美术验收

当前男版 V7 的 `89 → Run48` 缺少重心转移。这轮用图像生成补了两张**颈部以下的新身体图**，再把89的原头、脸、耳朵和头发按整数像素贴回。试验序列为 `89 → 新107 → 新108 → Run48 → Run49`。新图是补绘，不是从 Kling 视频准确提取的原帧。

重心和头部位移有了中间阶段，但新旧服装的纹理、衣褶与袖口仍会切换，B接Run48的脚部轨迹也未完全匹配。因此 **不接入默认播放，不扩大 gameplayMotion allowlist**。男版 V7、女版 V6、原视角、基础单次跳跃、换装和既有导出行为保持不变。

## 先看效果

- [V7／补绘候选：同时间落地 GIF 对比](review/male-landing-study-comparison.gif)
- [89、两张补绘、Run48／49：连续姿态图](review/male-bridge-pose-strip.png)
- [当前独立播放器里的108帧](review/player-frame-108-right.png)
- [700px/s移动地面的模拟诊断](review/ground-scroll-700-review.gif)

对比 GIF 来自项目现有 `themeActionGif` 导出器在浏览器生成的两个完整序列，再按同一呈现时间拼接。它不是工作台 GIF 按钮的下载文件。两侧采用固定显示比例，没有逐帧重定位、变形、混帧或加速；比较末尾有明确标注的700ms审阅暂停，循环用于检查。

候选增加2个24FPS时间步，原生多83.33ms。GIF的10ms时间精度使导出总时长从2830ms变为2920ms，**这不是等时长替换**。完整GIF均单次播放、无循环扩展；左右每帧精确镜像。地面诊断另有前后各500ms标注暂停，只模拟摄像机跟随时地面左移，不代表游戏已接入新过渡。

## 这轮具体改了什么

- 新107：远侧腿承重，近侧脚开始蹬离；新108：近侧腿回收，准备进入原Run48。
- 保留A初稿，改进B的过度收腿。另一次A修订会让支撑鞋上浮、压短躯干，已舍弃，没有进入候选。
- 原头只平移：A为`(-9,-7)`，B为`(-18,-14)`。53,442个可见受保护像素RGBA完全一致，无头部裁切、缩放或重绘。
- 去除原保护遮罩误包含的107个旧灰色背心领边像素，让补绘衬衫在其下方连接。只改这个候选的剪层规则，没有改原图或全局人物遮罩。
- 透明图在浅色、白色、深色底上检查。工具黑底预览里的大范围光晕主要是alpha=0的隐藏RGB，实际Canvas合成不显示该光晕。

[姿势与承重规格](pose-spec.md)是人工视觉判断，不是精确解剖数据。已有部分膝踝标签与真实可见腿部错配，因此本轮按真实腿、鞋的轮廓判断近远侧身份。

## 尚未通过的部分

| 项目                                   | 结论                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 身份保留、分层接入、单次播放、左右导出 | 技术检查通过                                                                                |
| 衣服连续性                             | 新图更平滑，与已有烘焙图的褶皱、袖口质感不同                                                |
| B到原Run48                             | 脚部路径和头形端点仍有变化，不能称无缝                                                      |
| 地面接触                               | 在700原生px/s假设下，89到48支撑鞋估算仍有约17.5px世界位移；鞋点为人工估测，不是自动追踪结果 |
| 其他角色和服装                         | 未适配。这里只是男版青色衬衫／卡其裤／当前发型的固定烘焙造型                                |
| 默认交互路线                           | 未启用新图；没有新版本的正式运动配置                                                        |

下一步应针对同一套衣褶与袖口做局部匹配，并校准最后一张补绘接Run48的腿和领口。当前不建议扩大到更多衣服或男女全套。

## 资产与复现

[源资产目录](../../artwork/kling-landing-bridge-study/source/)保留1024×1536透明原始生成稿和精确提示词；[运行资产目录](../../artwork/kling-landing-bridge-study/runtime/)包含512×768身体层及已组合的107／108。[溯源记录](../../artwork/kling-landing-bridge-study/art-provenance.json)记录生成、原头复制和审计；其中绝对路径是本次运行位置，不是运行时依赖。

以下在仓库根目录执行。需要现有npm依赖及Python Pillow。

```sh
node_modules/.bin/esbuild scripts/assemble-landing-bridge-head.ts --bundle --platform=node --format=esm --outfile=/tmp/assemble-landing-bridge-head.mjs
node /tmp/assemble-landing-bridge-head.mjs \
  --base-pack docs/paired-polish/review/male/side.character.zip \
  --body-a artwork/kling-landing-bridge-study/runtime/body-a.png \
  --body-b artwork/kling-landing-bridge-study/runtime/body-b.png \
  --out /tmp/landing-bridge-reproduced
```

装配器锁定已审阅的89帧RGBA和剪层哈希，不是通用抠头工具。它输出的107／108与已保存组合图逐字节一致，错误母版会被拒绝。只有生成的身体层经过浏览器Canvas从2倍尺寸缩小，原头从未经过重采样。

独立包用**当前工作台实际导出的男版V7包**作为基底；旧的paired-polish包可供上面剪头复现，但不能直接用于下面构建器的V7配置检查：

```sh
python scripts/build-landing-bridge-study.py \
  --base-pack /path/to/exported-male-v7.character.zip \
  --bridge-107 artwork/kling-landing-bridge-study/runtime/107.png \
  --bridge-108 artwork/kling-landing-bridge-study/runtime/108.png \
  --provenance artwork/kling-landing-bridge-study/art-provenance.json \
  --out /tmp/landing-bridge-pack
```

把生成的`male-landing-bridge-study.character.zip`导入现有`player.html`，选择 **Jump**。这个包的Jump明确是完整的`Run → Jump → 两张补绘 → Run`审阅序列，70个时间步、24FPS、只播一次；不是普通基础Jump。它不带gameplayMotion或motionFlow，不能拿来证明交互式过渡已经接通。

浏览器验收与左右GIF复现（先启动现有开发服务器）：

```sh
GATHRIA_REVIEW_URL=http://127.0.0.1:5173/player.html \
node scripts/review-landing-bridge-study.mjs \
  /tmp/landing-bridge-pack/male-landing-bridge-study.character.zip \
  /tmp/landing-bridge-exports
python scripts/build-landing-bridge-study-review.py \
  --exports /tmp/landing-bridge-exports --out /tmp/landing-bridge-review
```

可用`CHROMIUM_PATH`和`CHROMIUM_ARGS_JSON`指定本机浏览器。技术凭据见[实际播放器检查](checks/actual-player.json)、[独立PNG／GIF验证](checks/export-verification.json)、[原头独立验证](checks/head-independent.json)、[复现检查](checks/reproduction.json)。完整实验ZIP和源引用ZIP由脚本重建，不在仓库再复制两份19MB的既有图集。
