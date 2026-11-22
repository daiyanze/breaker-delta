# How changes are made

The method every coding agent (Claude Code, Pi, Codex, ...) and every human
follows in this repository. `CLAUDE.md` holds the rules; this file holds the
working method. Read `docs/lessons.md` before starting.

Sources: Karpathy's LLM coding guidelines
(github.com/multica-ai/andrej-karpathy-skills) and Anthropic's Claude Code
best practices (explore, plan, code, commit; show evidence, not claims).

## Four principles

1. **Think before coding.** State assumptions. If a request can be read two
   ways, say so instead of picking one silently. If a simpler approach exists,
   say so.
2. **Simplicity first.** The minimum code that solves the issue. No features,
   abstractions or configuration nobody asked for.
3. **Surgical changes.** Every changed line traces to the issue. Do not
   reformat, refactor or "improve" neighbouring code. Remove only what your
   own change made unused; mention other dead code instead of deleting it.
4. **Goal-driven execution.** Turn the issue's acceptance criteria into checks
   (a test, a command, an observable result) and loop until they pass.

## Picking work

Issues labelled `owner:claude-ok` are the agent's to do; `owner:human` and
`owner:human+claude` need the owner. A local session finds the next
one with `/next` (`.claude/commands/next.md`), or takes the one the owner
names. Nothing on GitHub starts work by itself (ADR 0016).

## Cloudflare credential

ADR 0019 sets the rules; this is where the token lives and how it is used.

**Every wrangler call that reaches Cloudflare goes through
`scripts/cf.sh`**, for example `scripts/cf.sh whoami`. Commands that need a
`wrangler.jsonc` run from the app folder: `cd apps/pipeline &&
../../scripts/cf.sh deploy`, which is what `bun run deploy` does there.
Local `wrangler dev` needs no token. The script loads the
agent's token into that one command. If it finds no token, or a malformed one, it stops, so
wrangler never falls back to the owner's `wrangler login`. Do not export the
token yourself: variables do not carry over between an agent's shell calls,
and wrangler uses a stored login when `CLOUDFLARE_API_TOKEN` is empty.

The owner stores the token and the account ID once. On macOS, use the
keychain:

```sh
# -U replaces an existing item. -w last, with no value, prompts for the secret.
security add-generic-password -U -a "$USER" -s breaker-delta-cloudflare-token -w
security add-generic-password -U -a "$USER" -s breaker-delta-cloudflare-account -w
```

- **Linux, with a running Secret Service** (GNOME Keyring or KWallet):
  `secret-tool store --label="Breaker Delta Cloudflare token" service breaker-delta-cloudflare-token`.
  Store `breaker-delta-cloudflare-account` the same way. It prompts for the
  value.
- **Elsewhere (Windows with Git Bash, or no keychain):** use
  `~/.config/breaker-delta/cloudflare.env` with mode 600, holding the lines
  `CLOUDFLARE_API_TOKEN=...` and `CLOUDFLARE_ACCOUNT_ID=...`. The script
  reads the file; it does not source it.

The first time, check that `scripts/cf.sh whoami` reports an account API
token, not an OAuth login.

Rules:

- Never read, print or `cat` the env file or a keychain item. Only
  `scripts/cf.sh` reads them.
- Do not put the token in Claude Code's `settings.json` `env`. That hands it
  to every command of every session.
- If the script says no token was found, stop and tell the owner. Do not ask
  for the value in the chat.

## The loop

1. **Explore.** Read the issue, `CLAUDE.md`, the ADRs it touches,
   `docs/lessons.md` and the code involved. Before choosing an approach,
   check what the design already decided (ADRs, `packages/db` schema,
   contracts).
2. **Plan.** List assumptions and every point where the plan differs from an
   ADR or an earlier decision. A difference from an ADR is the owner's call:
   ask before building on it. Everything else: decide, note it, carry on.
3. **Code.** Tests first for rules (`packages/core`, contracts, adapters).
   Keep each PR to one concern.
4. **Verify.** Run `bun run check`. Report evidence: commands and their
   results. If a check cannot run here (no network, no tool), say which one
   and wait for CI before calling the work done.
5. **PR.** The description says what changed, the design choices a reviewer
   should look at, every deviation from an ADR, and what was not verified
   locally. Claims such as "behaviour unchanged" come with the test that
   shows it.
6. **Review.** A separate agent with no context from the writing session
   reviews the PR with `.claude/commands/review.md`. The writer fixes
   blocking issues; a new agent re-reviews. After three rounds the owner
   decides.
7. **Learn.** When the owner corrects something, or CI or review catches a
   mistake the writer made, add a lesson (below). Do it in the same PR when
   the lesson is about that PR.

## Lessons

`docs/lessons.md` is the project's memory of mistakes, so they are not
repeated. Rules for it:

- **When to add one:** the owner corrected the work; CI or review caught a
  mistake the writer made; the same problem happened twice.
- **What an entry holds:** what happened (with a PR link), a one-line rule,
  its scope (which paths or kinds of work it applies to), and the evidence.
  Scope keeps a lesson from being applied where it does not fit.
- **Prefer a check.** If a lesson can be enforced by a test, lint rule,
  type configuration or `scripts/check-deps.ts`, add the check and keep the
  lesson as a pointer to it. A check cannot be forgotten.
- **Retire, do not delete.** A lesson that turns out wrong or obsolete is
  marked retired with the reason, so the record stays honest.
- **Keep it short.** Merge duplicates. If the file grows past what an agent
  reads in a minute, promote the durable rules to `CLAUDE.md` or a check.
