# Model providers

Which model endpoints Breaker Delta uses, and why (#15). ADR 0005 sets the
mechanism: an ordered chain of OpenAI-compatible endpoints per task, held
in settings. No provider is built into the code; the chains below are what
an installation is set up with.

- **Owner's decisions (2026-11-22):** the hosted providers are Workers AI,
  Groq and Gemini; local mode uses the user's own agent first.
- **Proposed by the agent, not yet confirmed:** which chain each provider
  is in, the order inside each chain, and the models named below.

Free tiers change often. The figures below were read on 2026-11-22, mostly
from recent third-party readings of the providers' own pages (September to
November 2026). Check the provider's console before relying on a number.

## Chains

| Mode | assign (frequent, simple) | summarize (rare, demanding; en, zh, ja) |
| --- | --- | --- |
| Local mode | local bridge, then the hosted chain if set | local bridge, then the hosted chain if set |
| Hosted instance | Workers AI, Groq, Gemini Flash-Lite | Gemini Flash-Lite, Groq, Workers AI |

**Local mode uses the user's own agent first.** The local bridge (ADR 0005,
#49) turns a request into one tool-less call to an agent CLI on the user's
machine. It costs the user no API quota and needs no key. Hosted providers
are a fallback, used only if the user configured them. Fetched content
reaches that agent only as data in a tool-less call (invariant 6).

## Comparison

| Provider | Free allowance | Terms and risks | Use |
| --- | --- | --- | --- |
| Cloudflare Workers AI | 10,000 Neurons a day, on the free and paid Workers plans. gpt-oss-120b costs about 31,800 Neurons per million input tokens and 68,200 per million output tokens. | Same account as the pipeline. Ongoing allowance, not a credit. | assign first; summarize last |
| Groq | Base limits Groq lists for gpt-oss-120b (its page labels them the Developer plan's; the free plan may be lower): 30 requests a minute, 1,000 a day, 8,000 tokens a minute, 200,000 tokens a day, per organisation. | A third-party reading says Groq does not train on API data; not yet confirmed in Groq's own terms. | Both chains |
| Google Gemini (AI Studio) | Flash and Flash-Lite are free within per-project limits. Google no longer publishes the numbers; they are shown in the AI Studio console. | Free-tier requests may be used to improve Google products. The inputs are public items, so this is acceptable. | summarize first (stronger in zh and ja); assign last |
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
| Gemini | `gemini-flash-latest` | `503 UNAVAILABLE` ("high demand"); not retried |

Notes from the run:

- `gpt-oss-120b` is a reasoning model: with `max_tokens: 5` it returned an
  empty answer and no error, because reasoning used the whole budget. The
  judge sets no `max_tokens` and already counts an empty answer as a failed
  attempt (`packages/judge`), so the chain moves on. Any future token cap
  must leave room for reasoning.
- Gemini Flash was overloaded at the time and Flash-Lite answered, so the
  proposed summarize chain starts with Flash-Lite. A free tier can refuse a
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
