# 历史拼接证明与当前服装覆盖层

`node scripts/assemble-paired-polish-catalog.mjs --check` 现在检查两个连续阶段，均只读，不生成或覆盖当前资产。

1. **历史 paired-polish 阶段**：从已合并 main 的永久提交 `5d63ae233ca83e61dc354e122a8708044f4e2653` 读取当时的三个服装目录和服装 ZIP，完整重放原有四个上衣修订、女版离线绑定、95 帧手部定位与头发像素检查。历史 `artwork/paired-polish/clothing/audit.json`、绑定证明和 matched-hair 目录必须仍与基线字节相同；当前源素材、registration 与头发仍接受原有校验。
2. **当前 coverage 阶段**：当前三个服装目录只能对已明确列入修复报告的项目更新 `sha256` 与 `bytes`；其他字段、角色 ID、原片、定位版本、尺寸、帧数量均保持。`verify-paired-coverage-layers.py` 再对 22 个有修改的双视角服装包共 2,234 个原生帧检查实际 RGBA 与 ownership：侧视只能执行冻结的逐像素取样／鞋底恢复，男原版只能改变已复核布料 runs，女原版新增 ownership 与合成结果必须符合冻结的 mask／RGBA 哈希。未列出的帧和像素不得变化，V2/V3 权限声明也必须与对应复核完全一致。

历史审查描述的是当时那一层的保留范围，不代表后续 coverage 修复仍保留所有旧衣像素。新的修改由独立报告承接，未改写旧审查收据，也没有简单放宽旧断言。无参数的旧版发布命令会拒绝执行，避免把当前修复资产覆盖回历史版本。

CI 只额外获取这一份永久提交，不拉取整个大型素材历史：

```sh
git fetch --no-tags --depth=1 origin 5d63ae233ca83e61dc354e122a8708044f4e2653
node scripts/assemble-paired-polish-catalog.mjs --check
```

检查依赖项目现有 Python 美术工具依赖与 `npm ci`。缺少该提交时会明确报错，不会回退到可变分支或跳过历史验证。
