# 男版落地候选：实际工作台与独立包

当前袖口与前襟修订已重新构建到男版落地候选。
新增修改来自 107 帧基础西装包；既有 107/108 低位落地扩展、源头部、共享定位与 V4 跑跳路线没有重画或改时序。

直接打开 `/workbench.html?character=male&mode=side-view&collection=landing-candidate`，选择婚礼套装，再播放跑步 → 跳跃 → 跑步。

- [右向实际导出前后 GIF](review/wedding-run-jump-before-after-right.gif)
- [左向实际导出前后 GIF](review/wedding-run-jump-before-after-left.gif)
- [实际工作台截图](review/wedding-workbench.png)
- [低位落地 107](review/wedding-107-right.png) · [恢复第一步 108](review/wedding-108-right.png)
- [实际按钮下载与保存重开记录](review/actual-workbench-review.json)
- [日常／西装上下装互换的实际 UI 保存重开](review/actual-mixed-review.json)
- [独立播放器验证](review/standalone-player-review.json)
- [前后 GIF 的帧数、时长和哈希](review/presentation.json)

前后 GIF 均为 77 帧、3,210 ms，以相同原生动作与相同显示尺寸导出。
日常套装同时经过回归，但本层没有再改它的画面；对应对比保留为未受影响的参照。
没有为 GIF 改变跳跃定义，也没有为播放对齐而逐帧移动人物。

实际工作台检查三种造型的左右 PNG/GIF、暂停帧保存重开和 CharacterPack 导出。
独立播放器只打开已下载的 CharacterPack，不依赖换装编辑器或服装服务；所有导出原生帧与保存项目的实际合成逐像素一致，重新导出的包保持原字节。
报告明确记录播放器使用真实时间还是受控时钟；一次真实时间播放观察也不等于持续帧率认证。

人物完整包、编辑项目与原始视频捕获保存在本地 `/tmp/wardrobe-finish/landing-ui`，本目录保存可审阅图和内容哈希，避免重复提交大体积源资产。
衣褶、源手部柔边和旧落地接触感仍有局限；技术验证不代替美术判断。
