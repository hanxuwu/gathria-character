# 单次跳跃：功能与视觉验收

基线是 `2ed5a19` 的双视角接缝修订。以下人物画面全部来自应用实际下载；接点联系表仅解码导出的 GIF，加底色与帧号，没有绘制新人物像素。

## 实际 GIF

上一版原片两跳对照：[男版](../paired-polish/review/male/side-jump-right.gif) · [女版](../paired-polish/review/female/side-jump-right.gif)。以下是本轮应用重新导出的结果。

| 内容                     | 男版                                                                                                     | 女版                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 侧视：单次跳跃           | [朝右](review/male/side-jump-right.gif) · [朝左](review/male/side-jump-left.gif)                         | [朝右](review/female/side-jump-right.gif) · [朝左](review/female/side-jump-left.gif)                         |
| 侧视：跑步 → 单跳 → 跑步 | [朝右](review/male/side-run-jump-run-right.gif) · [朝左](review/male/side-run-jump-run-left.gif)         | [朝右](review/female/side-run-jump-run-right.gif) · [朝左](review/female/side-run-jump-run-left.gif)         |
| 原版：单次跳跃           | [朝右](review/male/original-jump-right.gif) · [朝左](review/male/original-jump-left.gif)                 | [朝右](review/female/original-jump-right.gif) · [朝左](review/female/original-jump-left.gif)                 |
| 原版：跑步 → 单跳 → 跑步 | [朝右](review/male/original-run-jump-run-right.gif) · [朝左](review/male/original-run-jump-run-left.gif) | [朝右](review/female/original-run-jump-run-right.gif) · [朝左](review/female/original-run-jump-run-left.gif) |

GIF 均不循环。侧视单跳 28 帧／1.17 秒；原版单跳 39 帧／1.63 秒。完整跑跳序列：男侧 80 帧／3.33 秒，女侧 77 帧／3.21 秒，男女原版均 76 帧／3.17 秒。GIF 使用百分之一秒累计舍入，角色包保留 24 FPS。

实际界面：[男侧视](review/male/side-workspace.png) · [女侧视](review/female/side-workspace.png) · [男原版](review/male/original-workspace.png) · [女原版](review/female/original-workspace.png)。

## 功能检查

- 65 个单元测试文件、634 项测试通过，覆盖原有功能和新增动作控制、模式持久化、导出约束。
- TypeScript 与 Vite 生产构建通过。
- 编译后的男女角色、两个视角均验证单跳落地接回跑步，桌面与 390px 手机布局通过，无 HTTP／页面错误：[生产检查](review/production/verification.json)。
- 男女完整流程：默认单跳、跑步触发、重复空格、腾空时指定落地目标、暂停／拖动帧位、原片模式、V1 原样重开、V2 单跳模式和帧位恢复。
- 男女最后落地帧回归：暂停在第 28 帧后继续播放，完成落地后返回，不重新播放跳跃。
- 男女侧视舞台：基础单跳和旧原片各自通过键盘连发、空中换向、松键停止等检查。
- 8 个新动作／侧视交互用例与 6 个旧双视角用例均通过，共 14 个浏览器用例。旧用例保留原来的像素／字节断言，在原片模式验证完整导出、混搭、旧 V1／V2 外观工程重开、素材请求失败时保留已接受造型以及手机并排布局。
- 四个 CharacterPack 在关闭编辑器后由新浏览器上下文独立打开，能跳跃并接回跑步，重新导出字节完全一致；播放不依赖衣橱或骨骼模块。
- 四包共 393 个原生帧，图集 PNG 字节、帧格、锚点、尺寸与上一版完全一致。16 个 GIF 共 886 个解码帧，独立核对了像素量化、原生帧顺序、时长、非循环标记和左右镜像。

原始审计：[男版](review/male/pixel-verification.json) · [女版](review/female/pixel-verification.json)。[下载与文件清单](review/inventory.json)记录实际 CharacterPack SHA 和全部审阅文件 SHA。当前应用可直接下载完整角色包；仓库保存包内实际动作／角色 JSON，原图集复用清单中注明的既有完整包。

[检查汇总](review/checks/summary.json)附带原始日志的 SHA 与无损 gzip 存档；旧混搭工程审计和本轮生产截图也一并保留。

## 视觉检查

已检查四个视角的选帧联系表、应用画面和实际 GIF 的起跳／落地接点。

- 侧视只保留第一个完整跳跃弧线，第二次起跳已排除；第一次落地缓冲和恢复帧保留。
- 跳跃结束从选定跑步相位接入，画面中没有因切换控制而重播、倒放或中途截断腾空。
- 本轮没有新增、变形或重采样人物图集。脸型、身体比例、服装、发型和原动作单帧节奏保持。
- **仍有可见接点**：侧视跑步切入蓄力时，头部俯仰和近侧手臂的位置变化较快；落地恢复与跑步的姿态、上色也有原视频差异。回待机的手臂放下仍缺少专门的过渡画面。
- **仍有输入等待**：跑步使用每周期一个选定接点，最长可能等待接近 0.75 秒。这一版改善单跳与衔接调度，不能称为即时响应或完全无缝。
- 源素材中的运动模糊、鞋边少量色溢、既有袖口和裙摆轮廓变化没有在本轮修复。图集一致证明没有新增绘图退步，不代表这些旧问题已经消失。

实际接点放大检查：[男侧视](review/male/side-actual-flow-seams.png) · [女侧视](review/female/side-actual-flow-seams.png) · [男原版](review/male/original-actual-flow-seams.png) · [女原版](review/female/original-actual-flow-seams.png)。这些图保持 GIF 原尺寸，将起跳和接回跑步的相邻画面排列展示。

## 复现

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/single-jump.spec.ts tests/e2e/single-jump-side.spec.ts tests/e2e/side-motion-interaction.spec.ts --workers=1 --trace=off --output=/tmp/single-jump/playwright-results
node scripts/verify-single-jump-exports.mjs /tmp/single-jump/exports/male/exports.json
node scripts/verify-single-jump-exports.mjs /tmp/single-jump/exports/female/exports.json
python scripts/build-single-jump-review.py
```

端到端审阅输出保存在 `/tmp/single-jump/exports`；Python 依赖为 Pillow、NumPy，沿用项目现有美术检查环境。大包下载应将 Playwright `--output` 放到空间充足的位置。

首次浏览器运行男版通过，女版因工作区临时下载占满磁盘而中断；移到 `/tmp` 后女版完整流程及男女末帧回归通过。一次筛选命令未匹配测试，修正筛选后实际运行；这些中断不计作通过。
