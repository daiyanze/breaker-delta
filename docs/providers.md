# Model providers

Which model endpoints Breaker Delta uses, and why (#15). ADR 0005 sets the
mechanism: an ordered chain of OpenAI-compatible endpoints per task, held
in settings. No provider is built into the code; the chains below are what
an installation is set up with.

- **Owner's decisions (2026-11-22):** the hosted providers are Workers AI,
  Groq and Gemini; local mode uses the user's own agent first.
- **Owner's decisions (2026-11-23):** which chain each provider is in, the
  order inside each chain, the models in the table below, and the keys in
  "Keys". The agent proposed them; the owner confirmed them.

Free tiers change often. The figures below were read on 2026-11-22, mostly
from recent third-party readings of the providers' own pages (September to
November 2026). Check the provider's console before relying on a number.

**How a run picks its model (#42).** The `MODEL_DRIVER` variable, the same
name in every adapter (`apps/pipeline/src/core/model.ts`): unset means the
chains from settings, `assignProviders` for assign and `summarizeProviders`
for summarize, read at the start of each run. A task has no model when its
chain is empty or when there are no prompts to send: its step is skipped, no
call is made, its echoes or waves wait for a later run, and the rest of the
run (compute, the board, publish) goes on. No prompt ships yet: the chain
driver takes its prompts as an input, and #43 (assign) and #44 (summarize)
add them, each with an eval. Until then no provider is called, whatever the
chains hold. Both chains are also empty by default. `fake` is the
deterministic fake driver (#31) for both tasks, whatever the chains say; its
texts are marked `[fake]`. verify-local instances run with `fake`. This is
the agent's proposal (#36, #42), not reviewed.

## Chains

| Mode | assign (frequent, simple) | summarize (rare, demanding; en, zh, ja) |
| --- | --- | --- |
| Local mode | local bridge, then the hosted chain if set | local bridge, then the hosted chain if set |
| Hosted instance | Workers AI `@cf/openai/gpt-oss-120b`, Groq `openai/gpt-oss-120b`, Gemini `gemini-flash-lite-latest` | Gemini `gemini-flash-lite-latest`, Groq `openai/gpt-oss-120b`, Workers AI `@cf/openai/gpt-oss-120b` |

**Local mode uses the user's own agent first.** The local bridge (ADR 0005,
#49) turns a request into one tool-less call to an agent CLI on the user's
machine. It costs the user no API quota and needs no key. Hosted providers
are a fallback, used only if the user configured them. Fetched content
reaches that agent only as data in a tool-less call (invariant 6).

## Local bridge

How the bridge works is the agent's proposal (#49), not reviewed.

`apps/local/bridge.ts` is a small HTTP service that the launcher starts
when `BD_BRIDGE_COMMAND` is set. It answers `POST /v1/chat/completions`, the
request the judge sends, by running the command once per request: the
conversation goes to the command's stdin (one user message as it is,
anything else as a transcript in role tags), and its stdout is the answer.
The command is configured, not built in; nothing is put in its arguments.

```sh
BD_BRIDGE_COMMAND='["claude","--print","--tools","","--strict-mcp-config","--setting-sources","","--disable-slash-commands","--no-session-persistence"]' bun run local
```

Then put the bridge in a chain in settings, with no `apiKeyRef`:
`{"name": "bridge", "baseUrl": "http://127.0.0.1:8789/v1", "model": "local-agent"}`.
The bridge does not read `model`; it echoes it back. Until #43 and #44 add
the prompts, no chain is called, the bridge included.

**Why that command makes a tool-less call (invariant 6).** For Claude Code
2.1.323, checked on 2026-11-25 with one call on a harmless prompt, not on
fetched text: its `stream-json` start-up record listed `tools: []`,
`mcp_servers: []`, `skills: []` and `slash_commands: []`.

| Flag | What it removes |
| --- | --- |
| `--print` | the interactive session: one answer, then the process exits |
| `--tools ""` | every built-in tool (Bash, file edits, web fetch, sub-agents) |
| `--strict-mcp-config` with no `--mcp-config` | every MCP server, so no tool from one |
| `--setting-sources ""` | the user, project and local settings, so their hooks, plugins and permission rules (managed settings still apply) |
| `--disable-slash-commands` | skills and commands |
| `--no-session-persistence` | the saved transcript, which would hold fetched text |

The launcher refuses to start a `claude` command that lacks one of these
(`--print` may be `-p`) or has a flag that gives tools, folders or settings
back (`--mcp-config`, `--allowedTools`, `--add-dir`, `--settings`,
`--agents`, `--plugin-dir`, `--dangerously-skip-permissions`). That check
reads the arguments; it is not a sandbox. Another CLI is not checked: the
launcher warns, and making it tool-less is the user's job. No other CLI's
flags have been checked yet.

The bridge adds three guards of its own:

- Each call runs in a new empty folder that is deleted afterwards, so there
  is no project to read or change even if a tool were left on.
- A request that offers tools (`tools`, `functions`) or asks to stream is
  refused before the command runs.
- It listens on 127.0.0.1 only, and answers only requests addressed to
  `127.0.0.1` or `localhost` on its port with no `Origin` header, so a web
  page open in a browser cannot use it.

The command's stderr is neither logged nor returned, since it may repeat
the prompt; a failure is reported by exit code (HTTP 502), a call past
`BD_BRIDGE_TIMEOUT_SECONDS` (default 120) is killed (504), and so is a call
whose client hung up. Port: `BD_BRIDGE_PORT`, default 8789. These three are
launcher variables like `BD_PORT`, not settings: the bridge is a separate
service that does not read the database.

The judge waits 60 seconds per call (`packages/judge`), less than the
bridge's default, so a slower agent answer is cut off by the judge first and
the chain moves on. Measuring how long a real agent takes is for #43 and #44.

## Comparison

| Provider | Free allowance | Terms and risks | Use |
| --- | --- | --- | --- |
| Cloudflare Workers AI | 10,000 Neurons a day, on the free and paid Workers plans. gpt-oss-120b costs about 31,800 Neurons per million input tokens and 68,200 per million output tokens. | Same account as the pipeline. Ongoing allowance, not a credit. | assign first; summarize last |
| Groq | Base limits Groq lists for gpt-oss-120b (its page labels them the Developer plan's; the free plan may be lower): 30 requests a minute, 1,000 a day, 8,000 tokens a minute, 200,000 tokens a day, per organisation. | A third-party reading says Groq does not train on API data; not yet confirmed in Groq's own terms. | Both chains |
| Google Gemini (AI Studio) | Flash and Flash-Lite are free within per-project limits. Google no longer publishes the numbers; they are shown in the AI Studio console. | Free-tier requests may be used to improve Google products. The inputs are public items, so this is acceptable. | summarize first, as Flash-Lite (Flash was overloaded during verification; zh and ja quality not yet checked, M2 evals); assign last |
| OpenRouter `:free` models | 20 requests a minute; 50 a day, or 1,000 a day after $10 of lifetime credit. | Free models come and go without notice. | Not chosen; a candidate if the chosen quotas run short |
| Cerebras | No renewing free tier since 2026; new accounts get a one-time trial credit. | Not free over time. | Not used |
| GitHub Models | Free and rate-limited. | GitHub says the free use is not designed for production. A public service would break that. | Not used |

## Budget

One summary is roughly 3,000 input and 500 output tokens; one assign call
is smaller. These are estimates until M2 measures real prompts (evals).

- On Workers AI with gpt-oss-120b, a summary is about 130 Neurons, so the
  free 10,000 a day would cover about 75 summaries if nothing else used it.
  The assign chain draws on the same allowance first.
- On Groq, 200,000 tokens a day per model covers about 55 summaries, and
  8,000 tokens a minute allows about two summaries a minute.
- Gemini publishes no free-tier numbers; the console shows them per project.

So no single free tier carries 72 summaries a day (the default
`summariesPerRun` of 3 at hourly runs) together with assign. The three
together likely do, but that is not measured. If one summary is written in
all three languages at once, output tokens grow several times and the
budget shrinks to match. `summariesPerRun` is a setting, so it can be
lowered without a release once real usage is known.

## Keys

Keys are never stored in settings: a provider names the secret or
environment variable that holds its key (`apiKeyRef`).

How a key is read is the agent's proposal (#42), not reviewed: each run
reads it through the adapter, from the process environment in local mode
and from a Worker secret on Cloudflare (`wrangler secret put GROQ_API_KEY`).
The key is trimmed and goes only into the request's authorization header. A
provider whose secret is not set, is empty, or holds a control character
(CR, LF, NUL) is left out of the chain, not called without its key.

The key names and the arrangement in the table below were confirmed by the
owner on 2026-11-23.

| Provider | Key | Where it comes from |
| --- | --- | --- |
| Workers AI | `CF_AI_TOKEN` | An account-owned Cloudflare token with Workers AI permissions only. It is a separate token from the agent's operations token (ADR 0019) and from CI's deploy token, so each can be revoked on its own. Base URL: `https://api.cloudflare.com/client/v4/accounts/<account id>/ai/v1`. |
| Groq | `GROQ_API_KEY` | https://console.groq.com/keys |
| Gemini | `GEMINI_API_KEY` | Google AI Studio, in a Google Cloud project used only for Breaker Delta, so its quota is not shared. |

## Verification (#15)

One minimal chat-completions request per endpoint, sent by the owner from
the home machine on 2026-11-23 ("Reply with OK", up to 200 tokens):

| Endpoint | Model | Result |
| --- | --- | --- |
| Workers AI | `@cf/openai/gpt-oss-120b` | `OK`, finish `stop` |
| Groq | `openai/gpt-oss-120b` | `OK`, finish `stop`; 90 tokens, about 0.04 s |
| Gemini | `gemini-flash-lite-latest` | `OK` on the first try |
| Gemini | `gemini-flash-latest` | `503 UNAVAILABLE` ("high demand") on one request; not retried (the retry run was stopped after Flash-Lite answered) |

Notes from the run:

- `gpt-oss-120b` is a reasoning model: with `max_tokens: 5` it returned an
  empty answer and no error, because reasoning used the whole budget. The
  judge sets no `max_tokens` and already counts an empty answer as a failed
  attempt (`packages/judge`), so the chain moves on. Any future token cap
  must leave room for reasoning.
- Gemini Flash was overloaded at the time and Flash-Lite answered, so the
  summarize chain starts with Flash-Lite. A free tier can refuse a
  request at peak times; that is what the chain's fallback is for (ADR 0005).
- The Gemini OpenAI-compatible endpoint returns errors as a JSON array
  (`[{"error": ...}]`), not an object. The judge does not read error
  bodies: a non-2xx status alone fails the attempt.

## Sources

- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- OpenRouter limits: https://openrouter.ai/docs/api-reference/limits
- Cerebras rate limits: https://inference-docs.cerebras.ai/support/rate-limits
- GitHub Models, responsible use: https://docs.github.com/en/github-models/responsible-use-of-github-models
