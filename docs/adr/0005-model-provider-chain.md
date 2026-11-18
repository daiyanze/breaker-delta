# 0005 Model access is an ordered provider chain

Date: 2026-11-18. Status: accepted.

## Decision

The judge speaks one protocol: OpenAI-compatible chat completions over HTTP.
Settings hold an ordered list of providers (base URL, key, model). A call
tries the first provider, validates the output, retries once with the
validation error, then moves to the next provider. No provider is built in.

Local mode adds a bridge: a small local HTTP service that turns the same
request into one tool-less call to an agent CLI on the user's machine.

## Why

- Free tiers change often and cannot be a fixed dependency.
- Workers cannot spawn processes, so the hosted instance needs HTTP anyway.
- One protocol covers hosted APIs, local models and the bridge.

## Consequences

- Each summary records provider, model and prompt version.
- Assign (frequent, simple) and summarize (rare, demanding) may use different
  chains.
- Check each provider's terms before using a personal free tier in a public
  service.
