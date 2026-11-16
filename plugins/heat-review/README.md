# heat-review — review metric plugin (Plugin-P2)

A code plugin with the **review** slot. When a topic comes due
for its 14-day review, it judges hit/miss from the topic's own
recorded history: 3+ appearances, or a reappearance whose heat
did not fall, is a **hit**; a single appearance, or a
reappearance with falling heat, is a **miss**. Every verdict
carries a one-line evidence string.

```yaml
plugins:
  heat-review:
    enabled: true
```

Run it with `breaker-delta plugins review`. The review
mechanism — due dates, recording, the audit trail — stays the
engine's; the plugin only supplies the metric. Presets with a
domain metric (price moves, ratings) ship their own review
plugin the same way.
