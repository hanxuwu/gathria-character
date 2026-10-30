# 本轮验证：双视角衣橱

验证日期：2026-10-29。下面数字来自本轮执行，不复用历史报告。

## 功能与文件检查

- 全量单元测试：57 个文件、557 项通过；类型检查与生产构建通过。
- 新增实际浏览器流程：3 项通过，耗时约 5.4 分钟。
- 生产产物：男女两个项目、两个视角和另一套配色均成功载入，素材无 404，见 [production-check.json](production-check.json)。该报告保留了与服装加载无关的 favicon 404。
- 两个视角各用自己的动作、尺寸、来源绑定和帧位；切换后恢复原先预览，原版庆祝和侧视不可用状态分别检查。
- 上装换色、下装保留原片的混搭保存后，刷新再打开，两边 PNG 与保存前字节一致。
- 故意损坏存档中的侧视工程被拒绝，当前搭配和输出 PNG 不变。
- 390 像素宽度下无横向溢出，见 [手机截图](review/roundtrip/mobile.png)。

现有工作台、原换装和统一工作台的 19 项浏览器回归全部通过，耗时约 3.2 分钟。本轮浏览器检查合计 22 项通过。

## 实际导出证据

四组导出均由浏览器点击当前工作台按钮产生；检查脚本独立解码文件，没有用合成器再次生成一份相同结果来代替检查。

| 人物与视角 | 独立原画帧 | 左右 GIF | 独立角色包                                            |
| ---------- | ---------: | -------: | ----------------------------------------------------- |
| 男版原版   |         88 |       10 | [CharacterPack](review/male/original.character.zip)   |
| 男版侧视   |        107 |        8 | [CharacterPack](review/male/side.character.zip)       |
| 女版原版   |         96 |       10 | [CharacterPack](review/female/original.character.zip) |
| 女版侧视   |        102 |        8 | [CharacterPack](review/female/side.character.zip)     |

合计 393 张独立原画、36 个实际 GIF、4 个 CharacterPack。原版包含五种动作，侧视包含四种；帧数是独立原画数，动作中允许重复使用同一原画。

检查内容：

- ZIP 校验、所有 PNG 可解码、来源与衣料文件哈希绑定完整。
- 全部 393 帧：衣料 ownership 之外的 RGBA 与原片完全相同，头部及手部保护区完全相同，全图 alpha 完全相同，衣料内像素与实际登记衣料一致。
- 当前帧 PNG 与包内对应帧完全相同，左向 PNG 为精确镜像。
- 36 个 GIF：实际像素与对应包帧经过既有半尺寸、底色和调色板处理后的结果一致；帧序、重复帧、每帧时长、循环标识和左右镜像均检查。
- GIF 沿用现有半原生尺寸与不透明浅色底，PNG 和 CharacterPack 保留原生尺寸、透明通道和柔和边缘。

逐帧报告：[男版](review/male/pixel-verification.json) · [女版](review/female/pixel-verification.json)。

生成素材阶段另外核对了两种配色的 786 次组合，这是素材生成证据，不是又新增了 786 个动作帧，也不应与上面的应用导出检查重复累计。

## 关闭编辑器后的独立播放

每个人物导出完关闭编辑器页面，然后为原版、侧视分别创建新的浏览器上下文，仅打开 `/player.html` 并导入导出的 CharacterPack。

四次验证均确认跑步帧位变化、左向选择可用、再次导出的 ZIP 与导入 ZIP 字节相同。播放器没有请求换装、侧视编辑、骨骼或 Workbench 代码；它正常使用项目共用导航组件。

- 男版：[原版播放器](review/male/original-independent.png) · [侧视播放器](review/male/side-independent.png) · [记录](review/male/independent.json)
- 女版：[原版播放器](review/female/original-independent.png) · [侧视播放器](review/female/side-independent.png) · [记录](review/female/independent.json)

完整可编辑原生工程和双视角 ZIP 也经过保存与重开测试，为避免重复提交两份原片，不在审阅目录再复制这些大型存档。[男版存档哈希](review/male/editable-archive-checksums.json)和[女版存档哈希](review/female/editable-archive-checksums.json)记录本轮实测输出；下面命令可重新生成。

## 视觉审阅

- [男版两个视角跑步](review/male-views-run-right.gif) · [女版两个视角跑步](review/female-views-run-right.gif)
- [男版跑步关键帧](review/male-run-keyframes.png) · [女版跑步关键帧](review/female-run-keyframes.png)
- [男版原版实际工作台](review/male/original-workspace.png) · [男版侧视](review/male/side-workspace.png)
- [女版原版实际工作台](review/female/original-workspace.png) · [女版侧视](review/female/side-workspace.png)

并排 GIF 只用于审阅：两个面板直接取实际导出的半尺寸 GIF，各自按原时长播放；共同展示 3 秒后结束，不强行对齐相位、不伪造共同的循环接缝。原版 704 × 1056，侧视 512 × 768，人物占画面的比例也不同，面板保留这个差异。并排文件使用一张共用调色板；下面各目录中的独立 GIF 是未经拼接的实际导出。

- [男版全部原始导出](review/male/)
- [女版全部原始导出](review/female/)

人工图像检查抽查了 40 个实际跑步／跳跃姿势（男女、两个视角、各五帧）。这些样本中没有发现明显新增的衣料碎片、领口断开、腰线露缝或裤腿漂移；这不代表对每一帧做出了美术合格判断。

仍然可见的素材限制：原版运动中的部分姿势较模糊，女版原版短裤左侧高光线较突出，两个视角上衣的明暗不同。侧视跳跃从单脚过渡姿势开始、以蹲姿结束，按一次动作播放，不是无缝站立循环。这些原有特征没有因换装而被重新画掉。

## 复现

```sh
npm test
npm run typecheck
npm run build
CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_ARGS_JSON='["--no-sandbox"]' \
  npx playwright test tests/e2e/dual-view-wardrobe.spec.ts --workers=1
CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_ARGS_JSON='["--no-sandbox"]' \
  npx playwright test tests/e2e/workspace-shell.spec.ts tests/e2e/wardrobe.spec.ts \
  tests/e2e/unified-workbench.spec.ts --workers=1
node scripts/build-dual-view-review.mjs
```

新浏览器测试将导出写到 `/tmp/dual-view-wardrobe` 并调用独立检查器。检查器需要 Python、Pillow、NumPy；审阅构建器需要 Pillow 和 DejaVu Sans 字体。构建器复制真实导出、记录哈希，然后生成有尺寸与时间说明的联系图和并排预览。
