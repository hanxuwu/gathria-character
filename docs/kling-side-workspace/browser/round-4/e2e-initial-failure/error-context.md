# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: side-view.spec.ts >> side source load failure retries and character preparation disables stale exports
- Location: tests/e2e/side-view.spec.ts:214:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('side-playground').getByRole('alert')
Expected substring: "503"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByTestId('side-playground').getByRole('alert') with timeout 5000ms
  - waiting for getByTestId('side-playground').getByRole('alert')

```

```yaml
- banner:
  - link "Gathria character library":
    - /url: /
    - text: gathria characters
  - navigation "Main navigation":
    - link "Character library":
      - /url: /
    - link "Workbench":
      - /url: /workbench.html
    - link "Player":
      - /url: /player.html
- region "侧视动作与换装":
  - paragraph: SIDE VIEW · PLAY & DRESS
  - heading "让角色动起来" [level=2]
  - paragraph: 从原片动作出发，试穿、转身，也向前走几步。
  - button "打开项目" [disabled]:
    - img
    - text: 打开项目
  - button "保存项目" [disabled]:
    - img
    - text: 保存项目
  - text: 侧视预览 原生节奏 · 1× 24 fps
  - status: 正在准备原片与服装…
  - text: ← → / A D 移动 Shift 跑步 Space 跳跃 点击舞台即可操作
  - button "待机" [disabled] [pressed]
  - button "行走" [disabled]
  - button "跑步" [disabled]
  - button "连续跳跃（原片两次）" [disabled]
  - slider "动作帧" [disabled]: "0"
  - button "上一帧" [disabled]:
    - img
  - button "暂停播放" [disabled]:
    - img
  - button "下一帧" [disabled]:
    - img
  - strong: 待机
  - text: 准备中
  - button "朝左" [disabled]:
    - img
    - text: 左
  - button "朝右" [disabled] [pressed]:
    - text: 右
    - img
  - status: 正在准备服装与动作 · 67 / 107
  - group: 关于这组侧视动作
  - complementary "角色与舞台设置":
    - text: "01"
    - heading "角色与搭配" [level=3]
    - text: 角色
    - combobox "角色" [disabled]:
      - option "Kling 男版 · 侧视" [selected]
      - option "Kling 女版 · 侧视"
    - button "原片造型" [disabled] [pressed]
    - button "日常搭配" [disabled]
    - text: 上装
    - combobox "上装" [disabled]:
      - option "原片上装" [selected]
    - text: 下装
    - combobox "下装" [disabled]:
      - option "原片下装" [selected]
    - text: 鞋履
    - combobox "鞋履" [disabled]:
      - option "原片鞋履" [selected]
    - paragraph: 每件服装跟随原片逐帧对齐，试试混搭后再跑几步。
    - text: "02"
    - heading "舞台" [level=3]
    - button "原地预览" [pressed]
    - button "横向移动"
    - checkbox "地面参考线" [checked]
    - text: 地面参考线
    - checkbox "并排对比原片"
    - text: 并排对比原片
    - checkbox "显示 17 个服装定位点"
    - text: 显示 17 个服装定位点 03
    - heading "带走当前造型" [level=3]
    - button "透明 PNG 当前帧 · 原始尺寸" [disabled]:
      - img
      - text: 透明 PNG 当前帧 · 原始尺寸
    - button "动作 GIF 当前动作 · 原生节奏" [disabled]:
      - img
      - text: 动作 GIF 当前动作 · 原生节奏
    - button "CharacterPack 完整动作 · 可独立播放" [disabled]:
      - img
      - text: CharacterPack 完整动作 · 可独立播放
    - paragraph: 导出使用当前搭配和朝向。继续换装请保存项目。
```

# Test source

```ts
  131 |     expect(
  132 |       JSON.parse((await stage(page).getAttribute("data-selection"))!),
  133 |     ).toEqual(document.selection);
  134 |     await pause(page);
  135 |     await frame(page, 4);
  136 |     const savedPose = await download(page, "side-export-png");
  137 |     expect(savedPose.bytes).toEqual(mixedPose.bytes);
  138 |     await page.getByTestId("side-project-input").setInputFiles({
  139 |       name: "broken.wardrobe.zip",
  140 |       mimeType: "application/zip",
  141 |       buffer: Buffer.from("not a project"),
  142 |     });
  143 |     await expect(
  144 |       page.getByTestId("side-playground").getByRole("alert"),
  145 |     ).toBeVisible();
  146 |     await expect(page.getByTestId("side-playground")).toHaveAttribute(
  147 |       "aria-busy",
  148 |       "false",
  149 |     );
  150 |     expect(
  151 |       JSON.parse((await stage(page).getAttribute("data-selection"))!),
  152 |     ).toEqual(document.selection);
  153 |     // A successful PNG operation clears the error and proves the retained renderer works.
  154 |     const retained = await download(page, "side-export-png");
  155 |     expect(retained.bytes).toEqual(savedPose.bytes);
  156 |     expect(errors).toEqual([]);
  157 |   });
  158 | }
  159 | 
  160 | test("side keyboard travel retains source timing and the full two-jump one-shot", async ({
  161 |   page,
  162 | }) => {
  163 |   test.setTimeout(120_000);
  164 |   await page.goto("/workbench.html?mode=side-view&character=male");
  165 |   await ready(page);
  166 |   await page.getByTestId("side-mode-travel").click();
  167 |   await expect(stage(page)).toHaveAttribute("data-camera", "follow");
  168 |   await page.getByTestId("side-walk-speed").fill("120");
  169 |   await stage(page).focus();
  170 |   await page.keyboard.down("ArrowRight");
  171 |   await expect(stage(page)).toHaveAttribute("data-action", "walk");
  172 |   await expect
  173 |     .poll(async () => Number(await stage(page).getAttribute("data-position")))
  174 |     .toBeGreaterThan(20);
  175 |   await page.keyboard.down("Shift");
  176 |   await expect(stage(page)).toHaveAttribute("data-action", "run");
  177 |   await expect(stage(page)).toHaveAttribute("data-fps", "24");
  178 |   await page.keyboard.press("Space");
  179 |   await expect(stage(page)).toHaveAttribute("data-action", "jump");
  180 |   // Held run intent resumes only after the complete two-jump source clip.
  181 |   await expect(page.getByTestId("side-facing-left")).toBeDisabled();
  182 |   await expect(stage(page)).toHaveAttribute("data-action", "run", {
  183 |     timeout: 6000,
  184 |   });
  185 |   expect(
  186 |     Number(await stage(page).getAttribute("data-position")),
  187 |   ).toBeGreaterThan(330);
  188 |   await page.keyboard.up("Shift");
  189 |   await page.keyboard.up("ArrowRight");
  190 |   await expect(stage(page)).toHaveAttribute("data-action", "idle");
  191 |   await pause(page);
  192 |   await page.getByTestId("side-action-jump").click();
  193 |   await expect(page.getByTestId("side-frame")).toHaveAttribute("max", "49");
  194 |   await frame(page, 48);
  195 |   await page.getByTestId("side-play-pause").click();
  196 |   await expect(stage(page)).toHaveAttribute("data-ended", "true");
  197 |   await expect(stage(page)).toHaveAttribute("data-frame-position", "49");
  198 |   const held = await stage(page).evaluate((c: HTMLCanvasElement) =>
  199 |     c.toDataURL(),
  200 |   );
  201 |   await page.waitForTimeout(150);
  202 |   expect(
  203 |     await stage(page).evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  204 |   ).toBe(held);
  205 |   await page.getByTestId("side-action-jump").click();
  206 |   await expect(stage(page)).toHaveAttribute("data-ended", "false");
  207 |   await expect
  208 |     .poll(async () =>
  209 |       Number(await stage(page).getAttribute("data-frame-position")),
  210 |     )
  211 |     .toBeLessThan(25);
  212 | });
  213 | 
  214 | test("side source load failure retries and character preparation disables stale exports", async ({
  215 |   page,
  216 | }) => {
  217 |   test.setTimeout(240_000);
  218 |   await page.route(
  219 |     "**/assets/male.source.zip*",
  220 |     (route) =>
  221 |       route.fulfill({
  222 |         status: 503,
  223 |         contentType: "text/plain",
  224 |         body: "Controlled source-load failure",
  225 |       }),
  226 |     { times: 1 },
  227 |   );
  228 |   await page.goto("/workbench.html?mode=side-view&character=male");
  229 |   await expect(
  230 |     page.getByTestId("side-playground").getByRole("alert"),
> 231 |   ).toContainText("503");
      |     ^ Error: expect(locator).toContainText(expected) failed
  232 |   await expect(page.getByTestId("side-export-pack")).toBeDisabled();
  233 |   await page.getByRole("button", { name: "重新载入", exact: true }).click();
  234 |   await ready(page);
  235 |   await expect(stage(page)).toHaveAttribute("data-character", "male");
  236 |   let release!: () => void;
  237 |   let requested!: () => void;
  238 |   const gate = new Promise<void>((resolve) => {
  239 |     release = resolve;
  240 |   });
  241 |   const request = new Promise<void>((resolve) => {
  242 |     requested = resolve;
  243 |   });
  244 |   await page.route(
  245 |     "**/assets/female.source.zip*",
  246 |     async (route) => {
  247 |       requested();
  248 |       await gate;
  249 |       await route.continue();
  250 |     },
  251 |     { times: 1 },
  252 |   );
  253 |   await page.getByTestId("side-character").selectOption("female");
  254 |   try {
  255 |     await request;
  256 |     await expect(page.getByTestId("side-playground")).toHaveAttribute(
  257 |       "aria-busy",
  258 |       "true",
  259 |     );
  260 |     await expect(page.getByTestId("side-character")).toBeDisabled();
  261 |     await expect(page.getByTestId("side-export-pack")).toBeDisabled();
  262 |     await expect(page.getByTestId("side-save-project")).toBeDisabled();
  263 |     await expect(stage(page)).toHaveAttribute("data-character", "male");
  264 |   } finally {
  265 |     release();
  266 |   }
  267 |   await ready(page);
  268 |   await expect(stage(page)).toHaveAttribute("data-character", "female");
  269 |   await expect(page.getByTestId("side-character")).toHaveValue("female");
  270 |   await expect(page.getByTestId("side-export-pack")).toBeEnabled();
  271 | });
  272 | 
```