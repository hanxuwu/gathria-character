# 落地姿态：功能与视觉分别验收

基线：`c18168854b7e1bdf51b187422851bd996466d156`。新侧视配置 V5 只调整 Jump → Run 的早期出口：完整落地缓冲后，先显示两张前倾迈步图，再进入 Run。V4 的三条起跳路线、基础 Jump、晚请求兜底及原视角 V2 保持原样。

## 功能检查

- **711 项单测／71 文件通过**。覆盖完整恢复帧时长、小数时间、大步长与分段推进一致、移动时间累计、重复 Jump、Idle/Walk 排队、完整末尾 Run 周期、历史 V4 和错误 checkpoint 拒绝。
- TypeScript 与生产构建通过，构建 6.01 秒。
- 生产页面检查通过：男女、两个视角、单跳返回 Run、默认服装保留、外观资源地址与 390px 手机布局均验证；无页面错误、HTTP 错误或横向溢出。见 [生产记录](checks/production.json)。
- **8 个浏览器场景通过**：男女受控逐帧检查 2 例、实际落地及导出 2 例、三条起跳路线及历史包回放 2 例、键盘侧视单跳与原片切换 2 例。
- 受控浏览器使用实际图集、React、Canvas 和下载流程，只替换 RAF/时钟。恢复开始后 10ms 暂停保存，重开保持同画面、同剩余时间；恢复中重复 Jump 不排第二跳；隐藏页面不推进时间。原视角、原片模式和最后一张 Jump 的完整停留也通过。
- 修正侧视审阅和服装校正定位：恢复期间动作标签是 Run，显示的原生图却属于 Jump。现在按实际 frame ID 定位；找不到时保留当前姿态并提示，不跳到 Run 首帧。
- 带过渡帧的导出包补充 `leadIn` 播放规则，说明目标 FPS、冻结 entry 时钟和完整恢复段。独立播放器直接使用相同控制器。

第一次浏览器命令未指定本机 Chromium 路径，测试未能启动；指定 `/usr/bin/chromium` 后，两个场景通过。保留 [初次环境错误](checks/controlled.log) 和 [最终逐帧结果](checks/controlled-fixed.log)，不将未执行的首次命令算作通过。受控时钟检查不代表真实设备 FPS 保证；本轮没有跑完整仓库的全部 E2E 场景。

## 实际导出检查

[独立像素报告](checks/pixel-verification.json)直接解码实际下载的包和 GIF，不调用应用动作控制器或合成器：

- 最终 **4 包、393 张原生图集帧、14 个 GIF、724 个 GIF 帧实例**通过。图集 PNG、矩形、锚点和尺寸保持原样；GIF 与对应图集的量化像素一致，左右严格镜像。
- 男版完整跑跳跑从 70 tick 降到 68 tick，实际 GIF 2920 → 2830ms；女版从 67 降到 65 tick，2790 → 2710ms。原生时间差均为两帧、83.33ms；GIF 时长按 10ms 量化，所以显示差值不完全相同。
- 两张恢复图之后仍播放完整一轮 **18 帧 Run**，不会把恢复图计入跑步周期。原样跑跳 GIF 不带自动循环标记。
- 侧视基础单跳仍各 28 帧；原视角基础单跳仍各 39 帧。基础跳跃 GIF 与已接受的旧版逐字节相同。
- [包等价检查](checks/pack-equivalence.json)：原视角包内容保持完全一致；侧视仅动作配置及其说明文本变化。人物像素、服装、发型、脸部、几何和其他动作未改变。
- 补充导出接入说明后重新通过真实应用导出侧视包；重新下载的四张跑跳 GIF 与首轮下载、仓库审阅原图逐字节一致。
- 独立播放器验证当前 V5、历史 V1/V2/V3/V4；重新导出的包与导入包逐字节相同。

[配置等价报告](checks/profiles-equivalence.json)保留精确修改范围；各角色的浏览器记录、当前导出 JSON、下载收据和逐帧哈希位于 `checks/`。大体积图集不重复提交，可使用前一轮已提交的相同 PNG 页面与本轮 JSON 复核。

## 视觉检查

检查了原图、完整日常换装、实际 Canvas 恢复帧，以及实际 GIF 的落地近景与统一时间轴对比。本轮没有逐一审阅所有服装组合。

- **明确改善**：V4 的站直等待改为前倾蹬伸、第一步跨步再落脚，恢复跑步的主动性更清楚。
- **检查窗口内未见新增问题**：鞋与腿没有新脱节，未观察到新增断肢；原图本身的轮廓没有重新绘制或变形。
- **仍可见的接缝**：第一张分腿与甩臂偏快；男版 63 带原素材的半眨眼和向下俯脸，接入 Run 后抬头；女版 58 → 57 的发丝轮廓略有变化。原有衣袖、鞋掌滚动和衣料边缘差异仍在。
- **结论**：在复用现有素材的约束下，第一步姿态有改善，可以通过 GIF 复审。并未达到完全无缝，进一步处理需要专门补画重心转移图及对应服装层。

对比 GIF 只截取明确标注的落地窗口，固定 75% 缩放，按实际编码时间取帧，末尾增加 700ms 审阅停留。没有插帧、变形、逐帧居中或改变播放速率。四张完整原样下载保留原字节，见 [审阅哈希与时间记录](review/review-evidence.json)。

## 重现

```sh
npm test -- --maxWorkers=2
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_PAIRED_PLAYBACK_EVIDENCE=/tmp/landing-posture/controlled npx playwright test tests/e2e/paired-playback-cache.spec.ts --workers=1 --trace=off
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_LANDING_RUN_EXPORT_ROOT=/tmp/landing-posture/exports npx playwright test tests/e2e/landing-run.spec.ts --workers=1 --trace=off
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_TAKEOFF_EXPORT_ROOT=/tmp/landing-posture/final-exports npx playwright test tests/e2e/takeoff-refine.spec.ts tests/e2e/single-jump-side.spec.ts --workers=1 --trace=off
python scripts/build-landing-posture-review.py --before /tmp/takeoff-bridge/exports --after /tmp/landing-posture/final-exports --out /tmp/landing-posture/review
CHROMIUM_PATH=/usr/bin/chromium node scripts/smoke-dual-looks-production.mjs /tmp/landing-posture/production
```

Python 需要 Pillow／NumPy；对比脚本要求真实 V4 与 V5 导出文件，不会自动生成或替换缺失的基线。
