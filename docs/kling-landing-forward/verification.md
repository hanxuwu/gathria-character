# V6：技术验证与自然度分开记录

基线为 `75593c8c61f6ca1cee6f3cff186edfac0fbf3fb4`。V5 经用户反馈未通过自然度验收，本轮不沿用其“更有力度就是改善”的判断。

## 修改范围

只改变侧视两个配置的 Jump → Run 早期路线：男版恢复帧 `[88,89]` 后进入 Run49，女版 `[83,84]` 后进入 Run41。前面的落地、压缩、恢复顺序不倒退；省去两张近似恢复图。24 FPS、路线出口23、过渡帧数量及整段时长均与 V5 相同。

没有修改播放控制器、渲染器、美术图集、原视角配置、基础 Jump、起跳路线或晚请求兜底。V5 整个配置按原样归档，仅保证历史包和 checkpoint 可读，不代表它被重新认可为自然。

## 技术结果

- 全量 **717 项单测／71 文件通过**；TypeScript 与生产构建通过，构建耗时6.72秒。
- 独立验证器接受32个当前／历史配置，拒绝36个路线、帧序或帧率变异。V6 恢复段必须使用准确帧号、正向源顺序与24 FPS。
- 基础 Jump 导出与 V5 字节一致，恢复之后仍保留完整18帧 Run。历史 V5 的过渡 checkpoint 保留原配置、画面与小数时间。

- 实际浏览器 **4 项检查通过**：男女工作台逐帧播放，以及两版实际导出和独立播放器。两张恢复图分别验证保存重开，保留画面及10ms小数时间；当前 V6 和历史 V2/V3/V4/V5 均已检查。
- 下载的 **2 个侧视包、209 张原生图集帧、8 张 GIF／378 个 GIF 帧实例**通过独立检查。两个人物图集和 manifest 与 V5 字节一致，包中只有三份播放说明/配置文件改变。
- 男女左右四张基础 Jump GIF 与 V5 完全相同；完整 Run → Jump → Run 分别为68帧／2830ms、65帧／2710ms，逐帧时长与 V5 相同，末尾包含18帧 Run。
- 本轮未重新运行整个仓库的浏览器测试，也未重新导出原视角包。原视角配置等价和既有行为由本轮单测及实际画布对比覆盖。

详细结果见 `checks/`。技术检查证明实现符合所选路线，不能单独证明衔接自然。

## 视觉判断的依据

先对比全部落地恢复图与所有 Run 相位，再比较三类入口：V5 的大跨步、V4 的高抬后脚，以及当前低位收腿。检查对象包括原角色和完整日常换装。

- V5 的头部和手臂先恢复、再回到起跳前低头伸臂、然后再次进入 Run；本轮不再出现这段反向借图。
- V6 保持恢复方向，并让第一步从较收拢的腿型开始。它相对 V5 消除了已确认的动作方向冲突。
- 原素材仍缺少真正的双脚落地到单脚支撑的重心转移。男版头顶与脚底位置差约20px／9px，女版约8px／4px；省帧也减少了部分缓动。不能据此声称完全自然或无缝。
- 完整末帧90／85曾实际比较，会导致头部上冲后又回落，并带入前拳模糊，因此没有用于移动恢复。

实际 GIF 中仍可能读成“短暂站住后再起跑”，男版头部上移较明显。未发现这次落地窗口新增断肢或鞋腿分离；女版既有袖口、手臂轮廓变化仍存在。[完整视觉评估](visual-review.md)保留这些限制。

本轮不生成新姿态，不拉伸、插值或逐帧重新居中。对比使用完整头、臂、腿的固定窗口，保持真实编码时间，仅增加明确标注的末尾审阅暂停。精细画质以完整原样 GIF 为准。

## 重现

```sh
npm test -- --maxWorkers=2
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_PAIRED_PLAYBACK_EVIDENCE=/tmp/landing-natural/controlled GATHRIA_TAKEOFF_EXPORT_ROOT=/tmp/landing-natural/exports npx playwright test tests/e2e/paired-playback-cache.spec.ts tests/e2e/takeoff-refine.spec.ts --workers=1 --trace=off
python scripts/build-landing-forward-review.py --before /tmp/landing-posture/final-exports --after /tmp/landing-natural/exports --out /tmp/landing-natural/review
```

Python 需要 Pillow／NumPy。审阅脚本要求真实 V5、V6 下载文件，并检查帧数与逐帧时长一致；缺少文件时停止，不以诊断图替代实际导出。
