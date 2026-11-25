# Answer model calls through the local bridge

**What it is.** With `BD_BRIDGE_COMMAND` set, the launcher also starts the
model bridge (`apps/local/bridge.ts`, `docs/providers.md` "Local bridge"):
an OpenAI-compatible `/v1/chat/completions` on 127.0.0.1 that answers each
request with one call of that command, tools off. A chain in settings uses
it as a provider with `baseUrl` `http://127.0.0.1:<port>/v1`.

**How to reach it.** Start the instance with the variable set. Use the
fake agent, never a real agent CLI, when driving it from a coding session:

```sh
BD_BRIDGE_COMMAND="[\"$(which bun)\",\"$PWD/apps/local/test/fake-agent.ts\",\"--echo\"]" \
  bun scripts/verify-local.ts up
grep bridge .verify/<run>/instance.log    # its URL; verify-local picks a free port
```

`verify-local` has no command for the bridge; reach it with `curl`, which
`steps.tsv` does not record.

**Correct looks like:**

- `instance.log` has `[local] model bridge http://127.0.0.1:<port>/v1`, and
  a warning that a command other than `claude` is not checked for tools.
- `GET /health` answers `{"ok":true}`; a chat request with one user
  message answers a `chat.completion` whose content is that message (the
  fake agent's `--echo`), and the log adds `[bridge] call answered`.
- `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows `127.0.0.1:<port>` only, and
  the machine's LAN address refuses the connection.
- A request with an `Origin` header answers 403; one with `tools` answers
  400 and runs nothing.
- A `claude` command without the flags in `docs/providers.md` stops the
  launcher with exit 2 before anything starts.

**Check it:**

```sh
curl -s http://127.0.0.1:<port>/health
curl -s -X POST http://127.0.0.1:<port>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"local-agent","messages":[{"role":"user","content":"hello bridge"}]}'
bun scripts/verify-local.ts down
```

**Edges.** A tick does not call the bridge yet: verify-local runs with the
fake model, and no prompt ships until #43 and #44. A run through the bridge
is shown by `scripts/local-bridge.test.ts` with stand-in prompts.
