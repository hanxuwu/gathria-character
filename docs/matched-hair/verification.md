# 双视角同款发型：验收记录

日期：2026-10-30。对照为 PR #59 已提交的 `f6fb2471b07390fc8b9a9b81caed84c536a72c2f`。本轮重新绘制侧视发型，原版发型、衣服、原视频帧、身体比例与动作时钟保留。以下只统计最终冻结素材上的检查，不累加此前版本的测试次数。

## 功能检查：通过

| 检查                     | 本轮结果                                                                                      | 证据                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 单元测试                 | 最终素材冻结后，60 个文件、590 项通过                                                         | [unit.log](review/checks/unit.log)                                                          |
| 类型、素材绑定、生产构建 | 全部通过                                                                                      | [检查汇总](review/checks/root-summary.json)                                                 |
| 实际浏览器流程           | 4 项通过，14.1 分钟；无失败、跳过或重试                                                       | [Playwright 原始报告](review/checks/e2e-complete-results.json)                              |
| 独立逐像素审计           | 393 原生帧、36 个应用 GIF 通过                                                                | [男版](review/male/pixel-verification.json) · [女版](review/female/pixel-verification.json) |
| 独立播放器               | 关闭编辑器后，4 份包在新浏览器上下文加载、播放、转向及字节相同重导出通过                      | [男版](review/male/independent.json) · [女版](review/female/independent.json)               |
| 生产页面                 | 男女两视角使用精确的当前外观哈希；无页面或 HTTP 错误，默认棉质搭配保留，390 px 窄屏无横向溢出 | [生产验证](review/production/verification.json)                                             |
| 交付媒体                 | 79 PNG、52 GIF、4 CharacterPack，共 135 份完整解码通过                                        | [完整性报告](review/checks/review-integrity.json)                                           |

最终完整包对应原版男 88 帧、侧视男 107 帧、原版女 96 帧、侧视女 102 帧。原版两份 CharacterPack 与 PR #59 的对应包**逐字节相同**。侧视使用 `43b8bcb6…aadb79`、`8b394def…541e62` 两份新外观包；完整哈希在 [当前目录](assets/catalog.json) 和检查报告中。

浏览器用例通过真实控件下载 PNG、GIF、原生工程、双视角工程及 CharacterPack，没有直接调用内部合成器代造交付。每个人物覆盖：完整造型、三种发色、独立开关头发与表情、两种衣料配色、两种原片／新衣料混搭、保存刷新重开、故障回滚和独立导出。侧视没有庆祝动作，界面仍禁用该选项，包内也不补造庆祝。

## 保存兼容与显式升级

男女的新混搭工程和反向混搭工程均离线重开，原生 PNG 及重保存 ZIP 与保存前一致。旧 V1 无外观工程也逐字节重保存。503 外观加载失败及损坏工程导入后，当前两个视角的已接受内容保持不变。

旧 V2 外观兼容输入由实际保存工程嵌入 PR #59 旧侧视外观包构建，并保持标准 ZIP 编码；该输入明确标记为兼容夹具。页面重开后，两个视角的 PNG 与旧 PR #59 同帧审阅图相同，重保存 ZIP 与输入逐字节相同，没有下载新外观包或静默改发型。

本轮验证的升级路径是明确点击 **“替换为配对发型与表情”**，升级后衣料混搭、配色、动作、方向和帧位保留。对应的新旧同帧 PNG 与验证记录见 [男版保存重开](review/male-roundtrip/) 和 [女版保存重开](review/female-roundtrip/)。这些验证区别于“应用完整日常造型”，后者会同时重选整套搭配。

## 独立像素审计的范围

`verify-dual-looks-exports.mjs` 解码实际 UI 保存的原片、定位、衣料、外观和最终包，独立计算衣料归属、后发、脸部、前发的重组结果，不调用应用合成器。它按实际外观 ZIP 哈希查找旧或新目录，因此旧审阅导出仍能验证。

- 四份最终包的衣料银行哈希、选择、来源与来源说明，和 PR #59 对应包完全相同；原片哈希、定位哈希、动作帧序、FPS、循环标记、原视频帧索引保持一致。
- 新侧视的 209 个脸部条目，其原始 RGBA、归属遮罩、偏移、源帧回退方式不变；头部锚点、`headBounds`、面部保护区保持不变。原有前景多边形保留，新增颈部保护与实际绑定文件逐帧一致。
- 全 209 个侧视姿势的受保护不透明颈部／领口像素与仅衣服控制包相同。女侧 77 的旧棕色误覆盖点 `(304,505)` 已恢复为控制图像素，此帧检查了 4,040 个不透明颈部保护像素。
- 不透明原片手部保留。半透明边缘允许后发按精确的 destination-over 出现在后方，不把这种合理混合误称为半透明 RGBA 完全不变。
- 原生 PNG 与最终包同帧相同，左向 PNG 是右向的精确镜像；全部 GIF 逐帧核对量化像素、帧序、时长、循环标记及左右镜像。

原版仍为 768×1184 导出画布，侧视仍为 512×768；源像素没有缩放。应用 GIF 仍使用现有半尺寸与底色。等身高比较图只是展示变换，每个视角使用固定倍率和固定站立基线，不逐帧缩放、不重定时；详见 [展示规则](presentation.md)。

## 视觉检查：主要问题改善，仍有明确限制

实际导出中的男侧分现在具有与原版对应的宽发束、前额翻翘和后颅体积；女侧视是紧凑的短波波，不再把较长的耳后发尾当作同一款短发。原版美术保持不变。已审阅同身高头部／站姿、完整动作序列、原生前后对照及困难姿势局部。

- 女侧 64／77 的旧领口孤立发束消失，耳后连接更连贯，见 [77 同帧 2 倍对照](review/female-side-native77-head-neck-2x.png)。
- 男侧 67／79 的后脑覆盖不足已作头发局部修正，邻帧使用较小过渡权重；原耳、颈、脸和身体没有改动。见 [跳跃前后 GIF](review/male-side-jump-before-after.gif)。
- **女侧 95 仍有可见的肤色斜细线**：原有近手保护区把一段不透明后脑皮肤误归为手部，前发被裁掉，后发不能覆盖不透明源像素。半透明裂缝已补同源后层，但这条不透明残线仍需后续单独审阅遮挡归属。见 [95 同帧 2 倍对照](review/female-side-native95-head-neck-2x.png)，不能称为正常发束或无穿帮。
- 男侧 100 仍有轻微耳后／头皮边缘问题；原视频的模糊、头形变化及少量绿幕边缘继续保留。发型匹配不等于所有帧的轮廓已经完美。
- 男侧 82 的前肩切口、女侧 97 的前臂衣料碎片是既有衣料问题。短波波也使女版旧上衣后肩的台阶更容易被看见；本轮没有改衣服掩盖它们。男肩问题在 [82 同帧对照](review/male-side-native82-head-neck-2x.png) 的衣服控制、旧发与新发三列都存在；女前臂旧问题见 [前轮原生对照](../dual-looks/review/female-side-native97-source-clothes-look.png)。

因此本轮功能验收通过，发型款式匹配与主要耳颈连接有明确改善；**美术验收仍带上述限制，不作“全帧无穿帮”结论**。两视角来自不同视频，朝向、光照、源头形变化和动作相位仍不同；补绘的侧视发束不是三维投影，也没有新增头发惯性动画。

## 复现与交付

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/dual-view-complete-looks.spec.ts --workers=2
node scripts/verify-dual-looks-exports.mjs /tmp/kling-hair-match/exports/male/exports.json
node scripts/verify-dual-looks-exports.mjs /tmp/kling-hair-match/exports/female/exports.json
npm run build
node scripts/smoke-dual-looks-production.mjs docs/matched-hair/review/production
node scripts/build-matched-hair-review.mjs --input /tmp/kling-hair-match/exports
node scripts/assemble-matched-hair-review.mjs --input /tmp/kling-hair-match/exports
```

36 份应用原始 GIF 与 4 份 CharacterPack 按下载字节直接复制，见 [实际下载清单](review/actual-downloads.json)。另有 26 份展示媒体，其中 16 份比较 GIF；展示脚本只加标签、底色、裁切及固定展示缩放，不绘制新头发、衣服或身体。全部媒体解码校验为 292,834,353 字节，未计 JSON 与日志。

包含重复原片的大型可编辑工程、仅衣服控制包及独立重导出包实际经过保存、加载与比对，交付记录其 SHA 与大小，避免再次复制大份原片 ZIP。`editable-archive-checksums.json` 区分真实浏览器下载与旧 V2 兼容夹具；损坏测试输入不作为可用工程交付。

最终 590 项单元测试在最后一次素材修正之后重新执行；前一次日志单独保留而不重复计数。资源调度时主动中断的一次生产预览启动没有产生验收结果，也不计入通过次数；上述生产报告来自随后独立完成的运行。
