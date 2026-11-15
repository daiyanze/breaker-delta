# 发布流程 — Releasing Breaker Delta

[English](RELEASING.md) · **中文**

一次发布把项目的全部可分发形态一起发出去——引擎/CLI、Agent
Skill、Chrome 扩展——作为 GitHub Release 的附件。

## 发布产物

| 产物 | 说明 |
|---|---|
| `breaker-delta-<版本>.mjs` | 单文件 CLI（Node ≥ 20、零依赖、可直接执行）。这就是「breaker-delta」本体：引擎 + CLI 打成一个文件 |
| `breaker-delta-skill-<版本>.zip` | Agent Skill 包：`skills/breaker-delta/SKILL.md`、`.claude-plugin/plugin.json`，以及放在 `apps/cli/dist/breaker-delta.mjs` 的 CLI 单文件——按仓库原布局打包，解压后 SKILL.md 里写的路径直接可用 |
| `breaker-delta-extension-<扩展版本>.zip` | Chrome 扩展（未打包形态，`manifest.json` 在 zip 根目录）。不含实例数据——`data/` 里只有说明文件；`topics.json` / `alerts.json` 按扩展 README 的说明另行放入 |
| `SHA256SUMS.txt` | 上述三个产物的 SHA-256 校验和 |

Release 正文自动取自 `CHANGELOG.md` 里对应的 `## <版本>` 一节，
并附下载说明。

## 版本规则

- **全仓一个引擎版本**：根 `package.json`、`packages/{core,fetchers,publisher}`、
  `apps/cli`、CLI 的 `VERSION` 常量（`apps/cli/src/context.ts`）、
  `.claude-plugin/plugin.json` 必须同为一个 `X.Y.Z`；git 标签为 `vX.Y.Z`。
- **扩展有自己的版本线**（`apps/extension/manifest.json` 与其
  `package.json` 保持一致），因为它按自己的节奏变；它的版本写进
  自己的产物文件名，不跟发布标签走。
- `scripts/release.mjs` 在构建前逐项核对所有版本戳，任何一处
  对不上就中止发布。

## 发布步骤

```bash
# 1. 升引擎版本（版本号已就位时跳过）
npm run bump -- 0.22.0        # 即 node scripts/bump.mjs 0.22.0

# 2. 在 CHANGELOG.md 顶部加一节 `## 0.22.0`

# 3. 本地全量验证（完整测试 + 打包预演）
npm test
npm run release               # 产物暂存到 release-dist/
node release-dist/breaker-delta-0.22.0.mjs --help

# 4. 提交、打标签、推送——推标签即触发 workflow
git commit -am "0.22.0"
git tag v0.22.0
git push origin main v0.22.0
```

`release` workflow（`.github/workflows/release.yml`）随后会跑完整
测试、用 `scripts/release.mjs` 重新构建并暂存产物，再以 CHANGELOG
对应章节为正文创建 GitHub Release。

**只预演、不发布：** 在 Actions 里手动触发 release workflow
（选任意分支）。它会构建同样的产物并上传为 workflow artifact，
但不会创建 Release。

## 注意事项

- 产物一律由标签对应的代码树构建，不要手工改产物。
- `release-dist/` 已加入 .gitignore，它是暂存区，不是源码。
- 扩展 zip 故意不带 `topics.json` / `alerts.json`：那是实例数据
  （归数据仓，如 `breaker-delta-data`），引擎仓及其发布产物
  不含任何收集数据。
- 若 workflow 卡在版本校验，说明有版本戳漏改：跑
  `npm run bump -- <版本>` 后重新打标签。
