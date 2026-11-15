# PRIVACY

- Breaker Delta only reads public pages and public APIs. It logs into no account, posts nothing, and interacts with nothing.
- No secrets live in this repo: instance configs (`config.yaml` / `config.yml` / `config.json`) are excluded by `.gitignore`; the repo ships only the `config.example.yaml` / `config.example.json` samples.
- API keys for any paid source introduced in the future travel via environment variables / CI secrets only — never written into code, config samples, or reports.
- Reports summarize public information and link to the originals; full texts are never republished.

---

- 本雷达只读取公开页面和公开 API，不登录任何账号，不发帖、不互动。
- 仓库里不存放密钥：实例配置（`config.yaml` / `config.yml` / `config.json`）已被 `.gitignore` 排除，仓库只带 `config.example.yaml` / `config.example.json` 示例。
- 将来引入的付费源 API key 只走环境变量 / CI secrets，永不写进代码、配置示例或报告。
- 报告只汇总公开信息并附原始链接，不转载全文。
