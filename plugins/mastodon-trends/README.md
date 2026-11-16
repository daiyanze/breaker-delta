# mastodon-trends — fetcher plugin (Plugin-P1)

A code plugin with the **fetcher** slot. It reads Mastodon's
public trending-statuses API (mastodon.social, no key needed) and
contributes the results as an L2 fermentation candidate source
named `mastodon-trends` in every scan, under the same config
controls as built-in sources (`sources.mastodon-trends.enabled`,
`max_items`).

```yaml
plugins:
  mastodon-trends:
    enabled: true
    config:
      limit: 20   # 1–40, default 20
```

The manifest declares `permissions.network: [mastodon.social]` —
the plugin's fetch access is limited to that host by the host.
