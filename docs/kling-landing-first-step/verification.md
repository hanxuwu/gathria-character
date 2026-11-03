# 男版 V7 首步：验证范围

基线是已合并的 `1c196f099b68ed4a9e378d65f02b5d2f03702d0a`。运行配置仅改变男版侧视 ID（V6 → V7）及早期 Jump → Run 入口（10 → 9，对应原生49 → 48）。

## 已完成的代码验证

- 全量 **722 项单测／71 文件通过**，包括旧 V6 metadata 回读、保存状态的小数时间、恢复到旧帧49，以及新版本完整18帧接跑周期。
- TypeScript 和生产构建通过。
- 两个独立导出验证器合计接受34个当前／历史配置，拒绝16个变异；女版 V7 被明确拒绝。
- 与 main 逐项比较，女版 V6、原视角、源动作、帧率、恢复桥、起跳路线和晚请求恢复路线均未变化。男版 V6 完整配置按原值归档。

首轮浏览器检查3项通过，旧女版 V3 独立包的实时采样断言失败（见 `checks/initial/browser.log`）。旧断言要求切换前最后观测帧位于入口前两帧以内；浏览器可以跨多个原生帧推进，因此这个观测窗口不适合作为精确路线边界证明。它也在失败前没有写出采样明细，无法从首轮日志还原那次具体的 RAF 间隔。

针对独立播放器改用确定性原生帧步进，精确核对起跳入口、恢复桥和首张 Run，并在断言前保存观测记录；实际画布、网络、加载、下载和其余工作台检查仍使用真实实现。这是测试采样的修正，没有修改播放器运行逻辑。受影响的男女独立播放器／导出场景重跑 **2项均通过**（`checks/browser-final.log`）。加上首轮已通过且未修改的男女工作台受控播放检查，最终覆盖 **4项不同浏览器场景**。独立播放器逐帧检查当前配置、V2/V3/V4/V5，以及男版历史 V6；当前包也完成独立播放器原样重导出。

## 实际下载与兼容

- 两个侧视包的 **209张原生图集帧**与 main V6 的图集字节一致，manifest 字节不变；男包仅 gameplay 配置及出处说明中的配置版本标记改变，女包配置不变。
- 独立检查 **8张 GIF／378个帧实例**。四张基础 Jump GIF 与 V6 字节相同；女版完整左右跑跳 GIF 也与 V6 字节相同。
- 男版完整流程仍为68帧／2830ms，两次浏览器实际下载的4张男 GIF 完全相同。恢复之后保留完整18帧 Run；修改的是入口相位，不是开始跑步的时刻。
- 本轮没有重跑整个仓库的 E2E 套件，也未重新导出原视角包。原视角配置等价和既有行为由单测、工作台对比覆盖。

## 视觉验收边界

完整日常换装的小样中，Run48先出现较低的支撑姿态，再进入49的收腿；第一步的头顶抬升稍小。裸头原素材和当前发型都做了轮廓测量，包含不同 alpha 阈值；极高阈值会剔除半透明头发，因此不能单独用它判断头部位置。

这没有补出真正的双脚落地到单脚转移重心图。水平位置和脚底高度差仍在，舞台移动速度也没有改变。女版 Walk25／26造成垂臂和袖口跳变，因此没有采用。本轮技术检查不能作为“完全自然”的结论。[实际 GIF 视觉评估](visual-review.md)保留了仍然存在的接缝。

## 重现

```sh
npm test -- --maxWorkers=2
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_PAIRED_PLAYBACK_EVIDENCE=/tmp/landing-v7/controlled GATHRIA_TAKEOFF_EXPORT_ROOT=/tmp/landing-v7/exports npx playwright test tests/e2e/paired-playback-cache.spec.ts tests/e2e/takeoff-refine.spec.ts --workers=1 --trace=off --output=/tmp/landing-v7/browser
python scripts/build-landing-first-step-review.py --after /tmp/landing-v7/exports/male --out /tmp/landing-v7/review
```

对比脚本需要 Pillow 和真实应用下载。main V6 的对照 GIF 已保存在仓库中；任一输入缺失时会停止，不以诊断图冒充实际导出。
