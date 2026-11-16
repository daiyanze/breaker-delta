# webhook — exit plugin (Plugin-P1)

A code plugin with the **exit** slot. Whenever a new edition is
published (via `publish`, a `serve` push, or a manual
`breaker-delta plugins exit` run), it POSTs a JSON summary —
`{ event: "edition", file, edition: {date, slot, title}, topics:
[{name, slug, heat, level}] }` — to a configured URL.

```yaml
plugins:
  webhook:
    enabled: true
    config:
      url: "https://example.com/hook"
```

Set the env var `BREAKER_DELTA_WEBHOOK_TOKEN` to add an
`Authorization: Bearer <token>` header. Delivery is tracked per
plugin with a watermark (`state/plugin-exit-webhook.json`), so
each edition is delivered once; a failed POST is reported and
retried on the next run, and never fails the publish itself.
