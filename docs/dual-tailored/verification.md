# 本轮验收：双视角日常新款

日期：2026-10-29。分支：`feat/dual-view-daily-outfits`。以下只记录本轮运行结果；上一轮棉质搭配的记录仅作为旧工程字节基线，不计入本轮测试数量。

## 功能检查

- 完整单元测试：58 个文件、568 项通过；TypeScript 检查通过。
- 26 项不同的浏览器用例通过：原有衣橱、换装、统一工作台和页面入口 22 项，新服装流程 4 项。女版裙摆修复、最后手部修复后，分别重跑了相关 2 项，均通过；重跑不计为新增用例。
- 新服装实际导出审计：393 个原生帧、36 个换装 GIF、4 个 CharacterPack、4 次关闭编辑器后的独立播放器验证。
- 两色与新款／原片混搭的材质构建检查：男版 1,560 次、女版 1,584 次原生帧组合检查；两边逐字节重新生成均通过。女版最终 96 帧衣料种子和定位也完成独立重新构建，字节完全一致。它们是素材检查次数，不是额外的单元测试数量。
- 生产构建通过。生产版检查覆盖两个人物、两个视角和两种配色，没有页面异常或 HTTP 错误。

新浏览器流程由 `tests/e2e/dual-view-daily-outfits.spec.ts` 驱动真实界面选择、下载和上传，不直接调用合成器伪造交付文件。它验证：

1. 男女、原版／侧视、所有可用动作及左右朝向的 GIF、PNG 和 CharacterPack 导出。
2. 每份原生工程和服装 ZIP 的来源、定位、尺寸、帧集合与哈希绑定；原片帧序、动作时长、循环标记及锚点保持一致。
3. 对全部原生帧独立解码，验证衣料声明区域之外的 RGBA、受保护区域与源人物一致；透明通道只允许在声明的衣料区域内改变。女版最后审阅的 8 处手部另有直接原片检查：58,073 个原生像素保持原 RGBA，且上衣、裙子均不再拥有这些像素。手部轮廓、原片和最终衣料审计通过哈希关联。
4. GIF 解码后的帧序、量化像素、帧时长、左右镜像，以及 PNG 与 CharacterPack 的逐像素对应。PNG／CharacterPack 保持透明通道；GIF 沿用现有半尺寸、固定底色导出，不是透明 GIF。
5. 关闭编辑器后，四个全新浏览器上下文分别载入各自导出的 CharacterPack，播放跑步、切换朝向并逐字节重新导出；不加载换装或骨骼编辑模块。
6. 新上装／原片下装及原片上装／新下装的混搭、换色、保存、刷新重开，以及每个视角的动作／方向／帧位恢复。
7. 缺失衣料、损坏工程及未支持的跨组棉质标签都不能覆盖当前有效搭配。旧棉质工程保存结果与此前已提交的 SHA-256 完全一致。

独立导出审计脚本：`scripts/verify-dual-tailored-exports.mjs`。逐帧审计、独立播放器证据与实际导出分别保存在 [男版](review/male/) 和 [女版](review/female/)；[生产版截图与检查](review/production/) 单独保存。

本轮日志见 [review/checks/](review/checks/)。`browser-daily-first-pass.log` 是首次完整四项流程，`browser-female-hem-before-wrist.log` 是裙摆修复后的两项重跑，`browser-female-final.log` 是最终手部修复后的两项重跑。`female-authoring-reproducibility.log` 与 `female-reproducibility.log` 分别记录衣料种子重新构建和配色素材逐字节检查；旧浏览器回归、单元测试、生产构建与生产运行也分别记录。

## 视觉检查

技术检查先通过，实际画面仍暴露了裤脚和裙摆问题。本轮在实际导出中找到这些问题后，继续修复素材归属与遮挡，再重新导出验收。

### 男版裤脚

原生帧 ID 54 的旧手部保护区域误伸到后脚踝，使长裤保留了一个三角形裸露缺口。新版本定位只修正这一处误归属，再补齐裤料连接；旧定位、旧服装均保留。

实际修复前后 CharacterPack 对比：只有原生 ID 54 改变，共 1,523 个像素；另外 87 帧逐像素相同。最终 PNG 中大三角缺口已闭合，原手掌和鞋子保留。

- [跑步同帧前后 GIF](review/male-original-run-cuff-before-after.gif)
- [裤脚原生局部 2 倍对比](review/male-original-cuff-before-after-2x.png)
- [实际像素差异与文件哈希](review/male-cuff-comparison-provenance.json)

### 女版裙摆

原版六个姿势的手部区域误包含了腿或鞋；另外，衣料处理中的前臂延伸范围，在远手不可见时会把大腿当作前臂，从裙子中扣掉不该扣掉的部分。这导致跑步后跟附近的尖锐小钩，以及走路时髋部／大腿前方的缺口。

新版本定位修正六处手部误归属。裙子专用处理让近侧前臂范围止于实际手腕，由真实手部区域保护手掌；远手不可见时，不再保留落到大腿的假前臂范围。后鞋另外作为真实前景保留。没有修改原片、旧定位或全局合成保护规则。

实际最终导出中，后跟小钩已消除，走路时误露出的皮肤缺口明显改善。最后放大复核还发现，8 个走路帧的原手部保护没有覆盖完整的拇指、斜向手腕或拳头下缘，衣料因而侵入了手形。按原片重新标出这些前景边界后，只从上衣／裙子归属中排除对应手部像素；不重画皮肤，也不改变动作。原生 ID 47 的初次修订曾多圈进大腿皮肤，这个候选已拒绝，最终边界沿实际拳头描边收紧。

与首次实际导出比较，裙料只在 25 个走路帧和跑步原生 ID 54 改变；上衣只修正其中 5 个走路帧的手部覆盖，其余 91 帧保持原绘画结果。两件叠加后的角色包共有 26 帧改变，另外 70 帧逐像素相同。原生 ID 54 的可见修复仍为 470 个像素。六处定位修订中，ID 53 只改变了保护归属，最终画面仍相同。

- [走路同帧前后 GIF](review/female-original-walk-hem-before-after.gif)
- [跑步同帧前后 GIF](review/female-original-run-hem-before-after.gif)
- [后鞋与裙摆原生局部 2 倍对比](review/female-original-hem-before-after-2x.png)
- [八个困难姿势原生前后图](review/female-original-hem-review-poses-native.png)
- [手腕 ID 38 原片／修复前／修复后 2 倍对比](review/female-original-wrist38-source-before-after-2x.png)
- [八处手部实际导出对比：第一组](review/female-original-hands-source-before-after-2x-1.png) · [第二组](review/female-original-hands-source-before-after-2x-2.png)
- [实际像素差异、允许修改范围与文件哈希](review/female-hem-comparison-provenance.json)

实际像素差异检查读取最终美术审计中的修改范围，并核对种子衣料／定位哈希；上衣允许范围限定为已审阅的 5 个手部帧，下装限定为上述 26 帧。若导出的变化超出审阅范围，证据构建会失败。手部审计是对明确审阅区域的验证，不代表所有解剖部位已经自动标注正确。

## 剩余限制

- 这是同一款式在两个原生视角中的对应衣料；两个视角来自不同源视频，保留各自的光照、动作时钟、画幅与动作相位。
- 原版男衬衫的领口／折痕仍偏硬，部分交叉手臂与腰线的细节仍有拟合感；女版小裙褶和边缘也没有达到逐帧手绘的一致性。源视频模糊和抠图边缘仍保留。本轮解决的是主要错扣与连接缺口，不声称所有接缝完全消失。
- 旧彩色棉质组与新款组使用不同定位，本轮不提供跨组混搭；支持新款与原片衣服分别组合。
- 保存过的发型或表情若绑定另一套定位，切换服装组会明确拒绝迁移并保留当前工程；本轮不重绑定外观资产。
- 侧视没有庆祝片段，连续两跳仍作为一次原片动作。

## 展示材料怎样产生

`review/male/` 与 `review/female/` 中的 GIF、PNG、CharacterPack 和页面截图均来自应用实际流程。源人物／换装比较图从实际导出的原生工程和 CharacterPack 解码，使用同一帧及同一时长；比较 GIF 另用一套共享展示调色板，避免两份 GIF 各自量化造成未改脸部看似变色。原始应用 GIF 单独保留，未经过这一展示转换。

图中的 `native ID` 是 CharacterPack 原生帧 ID，并非原始视频帧索引；例如男女原生 ID 54 均对应视频源帧索引 143。修复对比的 provenance JSON 保存映射。原生关键帧图保持原生尺寸；局部图只使用 2 倍最近邻放大。跨视角预览保留两个源动作各自时钟，展示三秒后停止，不伪造共用循环。

为使像素差异可独立复核，修复前的原版 CharacterPack 也保存在 [男版修复前](review/male-before-cuff/original.character.zip) 和 [女版修复前](review/female-before-hem/original.character.zip)。各对比 provenance JSON 提供修复前后文件相对路径与 SHA-256；没有额外复制包含原片的编辑工程 ZIP。

## 复现命令

```sh
npm test
npm run typecheck
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/dual-view-wardrobe.spec.ts tests/e2e/wardrobe.spec.ts tests/e2e/workspace-shell.spec.ts tests/e2e/unified-workbench.spec.ts
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/dual-view-daily-outfits.spec.ts --workers=2
node scripts/build-dual-tailored-review.mjs /tmp/dual-tailored
```

工作目录默认 `/tmp/dual-tailored`。本轮修复前的实际导出分别保存在 `/tmp/dual-tailored-before-male/male` 与 `/tmp/dual-tailored-before-female/female`；可在最后一条命令追加 `--before-male=/tmp/dual-tailored-before-male/male --before-female=/tmp/dual-tailored-before-female/female` 生成本轮同帧修复对比。最终 CharacterPack 和修复前 CharacterPack 已随证据保存，独立像素复核不依赖这些临时目录。
