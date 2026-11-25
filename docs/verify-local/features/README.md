# Feature map

One file per thing a user can do with local mode, written from the user's
side: what it is, how to reach it, what correct looks like, and the commands
that check it. Keep each file true to the app; see "When the map is wrong"
in `../README.md`.

| Feature | File | Checked in CI by |
| --- | --- | --- |
| Start local mode and get a first run | `first-run.md` | `verify-local-selftest.sh` (up, doctor, sql); the full run's tables: `scripts/local-full-run.test.ts` (`bun run check`) and `spike-local.ts` (executable) |
| Run the current slot again | `tick.md` | `verify-local-selftest.sh` (tick) |
| Read the front page | `front-page.md` | `verify-local-selftest.sh` (get /) |
| Answer model calls through the local bridge | `model-bridge.md` | not driven in CI; the bridge's behaviour: `apps/local/test/bridge.test.ts`, a run through it: `scripts/local-bridge.test.ts` (`bun run check`) |

Not driven by this procedure, and where each is checked instead:

- The single-file executable a user downloads: `spike-local.yml`, jobs
  `local` and `downloaded`.
- Source reachability (`bun run probe`): needs the network, so it is run by
  hand (`docs/spikes/m0.md`).
- The Cloudflare adapter: the `cloudflare` job in `ci.yml` (miniflare).
