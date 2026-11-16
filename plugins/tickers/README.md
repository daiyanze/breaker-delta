# tickers — entity extraction plugin (Plugin-P2)

A code plugin with the **entities** slot. It scans each topic's
latest appearance (title + body + action) for listed-company
tickers — `$CASHTAG` mentions plus a built-in bilingual
company-name table （英伟达 → NVDA, 腾讯 → 0700.HK, …) — and stores
them as `plugins.tickers.entities` on the item. Topic pages draw
them as chips, and `data/topics.json` carries them to consumers
like the browser extension.

```yaml
plugins:
  tickers:
    enabled: true
```

Extraction is a dictionary on purpose: predictable and
reviewable. An empty result stores nothing.
