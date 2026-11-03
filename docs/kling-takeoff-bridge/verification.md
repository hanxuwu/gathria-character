# 跑步起跳过渡验收

本轮基线：`e2d58db86f7aeed9f0c5c7892c4eb348b73d0b27`。只修订侧视男女 Run → Jump 的进入路线；使用既有图集画面，不生成或修改人物资产。

## 功能检查

- 全量单元测试：**687 项／69 文件通过**，包括六条过渡逐帧时间、小数时间余量、分段与大步长一致性、重复跳跃、落地目标切换、缺失素材拒绝，以及历史路线。
- TypeScript 与生产构建通过。构建耗时 6.12 秒。
- 生产页面检查通过：男女、原视角／侧视、单跳返回跑步、默认服装保留、外观素材地址、390px 手机布局均检查；无页面错误、HTTP 错误或横向溢出。
- 两个真实浏览器场景通过：男女各检查三条起跳路线及跨周期请求，实际下载 CharacterPack 与左右 GIF，并在独立播放器中打开当前 V4、历史 V2、历史 V3。
- 两个受控 RAF 浏览器场景通过：真实图集与渲染器逐帧显示所有六条过渡；准备中重复跳跃不重启，Run／Idle 意图保留到落地；隐藏页面不推进时钟；暂停在过渡开始后 10ms 保存，重新打开保持同帧、同时间、同落地目标，继续播放正确。
- 对照的原视角、末帧停留和原片模式检查保留。原视角两个配置与基线完全相同，侧视旧 V3 配置完整存入历史表。

受控浏览器只替换 RAF、时钟和页面可见性；素材、网络、React、Canvas、项目文件导入导出均走实际应用流程。它证明原生帧顺序和暂停恢复，不代表真实设备 FPS 保证。真实浏览器观察器可能漏记一张 41.67ms 的画面，不能将漏记等同于配置缺失；所有观察到的帧必须符合对应路线且顺序前进。

首次新增浏览器夹具误将“播放中选择动作”当作暂停，断言因此失败；该操作实际会排队切换动作。夹具改为显式暂停后再选帧，最终男女两个场景均通过。未放宽动作、像素、保存恢复或时间断言。初次结果和最终通过日志分别保留，不能将初次整组命令标为全通过。

## 实际导出校验

独立校验器不导入应用动作控制器或图像合成器，直接解码实际下载的图集与 GIF：

- **2 个 CharacterPack、209 张原生帧**的图集、矩形、锚点和尺寸保持原样。
- **8 个 GIF、386 个帧实例**逐一核对图集像素、顺序、24 FPS 对应的 GIF 时长及左右镜像。
- 基础 Jump 仍是男版 63–90、女版 58–85，各 28 帧，四个基础跳跃 GIF 与原来逐字节相同。
- 跑跳序列为男版 70 tick（约 2917ms）、女版 67 tick（约 2792ms）；实际 GIF 因 10ms 量化为 2920ms／2790ms。各包含一次主跳跃，不写入 GIF 自动循环标记。
- 独立播放器确实绘制了男版 59 → 60 → 61 → 62 → 63、女版 54 → 55 → 56 → 57 → 58 的接入序列；重新下载的包与导入包逐字节相同。
- 对比上一轮实际包，只有 `character.json` 中的动作配置、配置 ID，以及生成说明中的配置 ID 改变。`manifest.json`、PNG 图集及其余搭配配置保持原样。

[导出等价检查](checks/pack-equivalence.json)与[配置等价检查](checks/profiles-equivalence.json)记录这些范围。完整逐帧哈希、浏览器下载收据、当前及历史播放器记录位于 `checks/exports/`。

## 视觉检查

已逐帧检查源素材／换装选帧图，以及实际导出 GIF 的进入段、帧序和共同时间轴；并检查实际页面截图。对比 GIF 使用统一裁切与比例，没有将人物逐帧对齐来掩盖移动。

- **明确改善：** 前摆臂、抬膝和接近落脚的三种跑步状态各接入对应的前倾／收步姿势，头部和手臂不再总是一步切进下蹲。
- **避免新退步：** 排除男版 58 的既有头发突然下沉；最后一个入口仅接一帧，避免再插入一次明显抬脚反弹。完整主跳跃和落地恢复没有删帧或加速。
- **原有边界：** 女版 57 → 58 的头发轮廓仍有轻微变化；原视频的头部俯仰、脸部阴影及部分衣料边缘仍存在差别。本轮没有修复这些美术素材，也不宣称整个人物已完全无穿帮。
- **验收结论：** 作为跑步起跳衔接的候选改进，可通过实际 GIF 复审；功能通过不能代替用户对自然程度的最终判断。

实际导出进入段：[男版同帧序列](review/male-side-takeoff-seams.png)／[女版同帧序列](review/female-side-takeoff-seams.png)。两行各自以跑步出口对齐并标出实际时间；共同时间播放请使用 [README 的前后 GIF](README.md)。

## 重现

```sh
npm test -- --maxWorkers=2
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_TAKEOFF_EXPORT_ROOT=/tmp/takeoff-bridge/exports npx playwright test tests/e2e/takeoff-refine.spec.ts --workers=1 --trace=off
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_PAIRED_PLAYBACK_EVIDENCE=/tmp/takeoff-bridge/clock npx playwright test tests/e2e/paired-playback-cache.spec.ts --workers=1 --trace=off
python scripts/build-takeoff-bridge-review.py
CHROMIUM_PATH=/usr/bin/chromium node scripts/smoke-dual-looks-production.mjs /tmp/takeoff-bridge/production
```

Python 比较和独立像素检查需要 Pillow／NumPy。审阅 GIF 会添加明确标注的末尾停留与重播；单独保存的实际 GIF 不修改。旧版应用不保证支持包含过渡 checkpoint 的新项目，但当前应用继续读取旧项目及历史动作包。
