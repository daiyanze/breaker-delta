# momentum — sub-score plugin (Plugin-P1)

A code plugin with the **score** slot. It computes a 0–100
momentum score for every topic from data the engine already has —
appearance count (up to 30), heat trend from first to latest
appearance (up to 40), and distinct-source breadth (up to 30) —
and stores it as `plugins.momentum.score` on the topic's latest
appearance. Board and topic pages render it as a labelled chip
next to the heat when the plugin is enabled.

The score is a side metric: it never feeds back into the heat
itself (the heat formula is an engine invariant).

Enable in the instance config:

```yaml
plugins:
  momentum:
    enabled: true
```

Scores are computed by the CLI pipeline: `publish` runs the pass
automatically; instances whose editions arrive by git can run
`breaker-delta plugins score` explicitly.

The pack also carries the **page** slot (Plugin-P2): a Momentum
Board page ranking every scored topic, rendered at
`plugin-momentum.html` / `/<lang>/plugin/momentum` and linked
from the tab bar whenever the plugin is enabled and the page
pass has run.
