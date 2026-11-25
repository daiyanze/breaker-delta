/**
 * The local model bridge (#49). Every call runs `fake-agent.ts`, never a
 * real agent CLI, and no test sends fetched text.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import {
  BRIDGE_HOST,
  type Bridge,
  type ChatMessage,
  CLAUDE_TOOLLESS,
  parseChatRequest,
  parseCommand,
  renderPrompt,
  startBridge,
  toollessProblem,
} from "../bridge.ts";

const FAKE = join(import.meta.dir, "fake-agent.ts");
const agent = (...args: string[]) => [process.execPath, FAKE, ...args];
const quiet = () => {};

let running: Bridge[] = [];
afterEach(async () => {
  await Promise.all(running.map((b) => b.stop()));
  running = [];
});

function bridge(command: string[], timeoutMs = 10_000) {
  const b = startBridge({ command, port: 0, timeoutMs, log: quiet });
  running.push(b);
  return b;
}

function scratch() {
  return mkdtempSync(join(tmpdir(), "bd-bridge-test-"));
}

const chat = (b: Bridge, body: unknown, init: RequestInit = {}) =>
  fetch(`${b.url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });

const user = (content: string) => ({ model: "agent", messages: [{ role: "user", content }] });

describe("parseCommand", () => {
  test("reads a JSON array of strings", () => {
    expect(parseCommand('["claude", "--tools", ""]')).toEqual(["claude", "--tools", ""]);
  });

  test("refuses anything else", () => {
    for (const bad of ["claude -p", "[]", '[""]', "[1]", '{"a":1}', '"claude"']) {
      expect(() => parseCommand(bad)).toThrow("BD_BRIDGE_COMMAND");
    }
  });
});

describe("toollessProblem", () => {
  test("the documented claude command passes", () => {
    expect(toollessProblem(CLAUDE_TOOLLESS)).toBeNull();
    expect(toollessProblem(["/opt/bin/claude.exe", ...CLAUDE_TOOLLESS.slice(1)])).toBeNull();
    const equals = ["claude", "-p", "--tools=", "--strict-mcp-config", "--setting-sources="];
    expect(toollessProblem([...equals, "--disable-slash-commands"])).toBeNull();
  });

  test("a claude command missing any required flag is refused, by name", () => {
    const args = CLAUDE_TOOLLESS.slice(1);
    const cases: [string[], string][] = [
      [args.filter((a) => a !== "--print"), "-p/--print"],
      [args.filter((a) => a !== "--strict-mcp-config"), "--strict-mcp-config"],
      [args.filter((a) => a !== "--disable-slash-commands"), "--disable-slash-commands"],
      [["--print", "--strict-mcp-config", "--disable-slash-commands"], '--tools ""'],
    ];
    for (const [a, name] of cases) expect(toollessProblem(["claude", ...a])).toContain(name);
  });

  test("tools named after --tools are not tool-less", () => {
    const named = CLAUDE_TOOLLESS.map((a, i) => (i === 3 ? "Bash,Edit" : a));
    expect(toollessProblem(named)).toContain('--tools ""');
    const settings = CLAUDE_TOOLLESS.map((a, i) => (i === 6 ? "user" : a));
    expect(toollessProblem(settings)).toContain('--setting-sources ""');
  });

  test("flags that bring tools, folders or settings back are refused", () => {
    for (const extra of [
      ["--mcp-config", "x.json"],
      ["--mcp-config=x.json"],
      ["--allowedTools", "Bash"],
      ["--add-dir", "/"],
      ["--dangerously-skip-permissions"],
      ["--settings", "{}"],
    ]) {
      expect(toollessProblem([...CLAUDE_TOOLLESS, ...extra])).toContain("must not have");
    }
  });

  test("another CLI is not checked", () => {
    expect(toollessProblem(["my-agent"])).toBeNull();
  });

  test("docs/providers.md gives the same claude command", () => {
    const doc = readFileSync(join(import.meta.dir, "../../../docs/providers.md"), "utf8");
    expect(doc.includes(`BD_BRIDGE_COMMAND='${JSON.stringify(CLAUDE_TOOLLESS)}'`)).toBe(true);
  });
});

describe("parseChatRequest", () => {
  test("keeps the model and the messages", () => {
    expect(parseChatRequest({ ...user("hi"), temperature: 0 })).toEqual({
      ok: true,
      value: { model: "agent", messages: [{ role: "user", content: "hi" }] },
    });
  });

  test("refuses a request that offers tools or asks to stream", () => {
    for (const extra of [
      { tools: [] },
      { functions: [] },
      { tool_choice: "auto" },
      { function_call: "auto" },
      { stream: true },
    ]) {
      expect(parseChatRequest({ ...user("hi"), ...extra }).ok).toBe(false);
    }
  });

  test("refuses messages it cannot render", () => {
    for (const messages of [
      [],
      [{ role: "tool", content: "x" }],
      [{ role: "user", content: [{ type: "text", text: "x" }] }],
      [null],
    ]) {
      expect(parseChatRequest({ model: "m", messages }).ok).toBe(false);
    }
    expect(parseChatRequest([]).ok).toBe(false);
  });
});

describe("renderPrompt", () => {
  test("a single user message goes as it is", () => {
    expect(renderPrompt([{ role: "user", content: "only this" }])).toBe("only this");
  });

  test("a conversation is a transcript in role tags, oldest first", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "S" },
      { role: "user", content: "U" },
      { role: "assistant", content: "A" },
      { role: "user", content: "fix it" },
    ];
    expect(renderPrompt(messages)).toBe(
      "<system>\nS\n</system>\n\n<user>\nU\n</user>\n\n<assistant>\nA\n</assistant>\n\n" +
        "<user>\nfix it\n</user>\n\nReply with the next assistant message only.",
    );
  });
});

describe("startBridge", () => {
  test("listens on 127.0.0.1 only", async () => {
    const b = bridge(agent());
    expect(b.url).toBe(`http://${BRIDGE_HOST}:${b.port}`);
    expect(await (await fetch(`${b.url}/health`)).json()).toEqual({ ok: true });
    // Every other address of this machine refuses the connection.
    const others = Object.values(networkInterfaces())
      .flat()
      .filter((a) => a && !a.internal && a.family === "IPv4")
      .map((a) => a?.address as string);
    for (const address of others) {
      const reached = await fetch(`http://${address}:${b.port}/health`, {
        signal: AbortSignal.timeout(2000),
      }).then(
        () => true,
        () => false,
      );
      expect({ address, reached }).toEqual({ address, reached: false });
    }
    // IPv6 loopback is another address, not 127.0.0.1.
    const v6 = await fetch(`http://[::1]:${b.port}/health`).then(
      () => true,
      () => false,
    );
    expect(v6).toBe(false);
  });

  test("answers only requests addressed to localhost, and none from a web page", async () => {
    const b = bridge(agent("--echo"));
    const at = (headers: Record<string, string>) =>
      chat(b, user("x"), {
        headers: { "content-type": "application/json", ...headers },
      }).then((r) => r.status);
    expect(await at({ host: "evil.example" })).toBe(403);
    expect(await at({ host: `evil.example:${b.port}` })).toBe(403);
    expect(await at({ origin: "https://evil.example" })).toBe(403);
    expect(await at({ host: `localhost:${b.port}` })).toBe(200);
    expect(await at({})).toBe(200);
    const plain = await chat(b, user("x"), { headers: { "content-type": "text/plain" } });
    expect(plain.status).toBe(415);
  });

  test("one request is one call of the configured command, with the prompt on stdin", async () => {
    const dir = scratch();
    const log = join(dir, "calls.jsonl");
    const command = agent("--log", log, "--echo", "--tools", "");
    const b = bridge(command);
    const messages = [
      { role: "system", content: "S" },
      { role: "user", content: "U" },
    ] as const;
    const res = await chat(b, { model: "agent", messages, temperature: 0 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      model: string;
      choices: { message: { role: string; content: string }; finish_reason: string }[];
    };
    expect(body.model).toBe("agent");
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0]?.message).toEqual({
      role: "assistant",
      content: renderPrompt([...messages]),
    });
    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(calls).toHaveLength(1);
    // The configured argv exactly, nothing of the prompt in it.
    expect(calls[0].argv).toEqual(command.slice(2));
    // A new empty folder, deleted after the call.
    expect(calls[0].cwdEntries).toBe(0);
    expect(calls[0].cwd).not.toBe(process.cwd());
    expect(existsSync(calls[0].cwd)).toBe(false);
  });

  test("the judge's base URL form works: /v1 then /chat/completions", async () => {
    const b = bridge(agent());
    const res = await fetch(`${b.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user('ANSWER: {"ok":true}')),
    });
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0]?.message.content).toBe('{"ok":true}');
    expect((await fetch(`${b.url}/v1/models`)).status).toBe(404);
  });

  test("a request with tools never runs the command", async () => {
    const dir = scratch();
    const log = join(dir, "calls.jsonl");
    const b = bridge(agent("--log", log));
    const res = await chat(b, { ...user("x"), tools: [{ type: "function" }] });
    expect(res.status).toBe(400);
    expect(existsSync(log)).toBe(false);
  });

  test("a failed call is a 502 that names the exit code only", async () => {
    const failing = bridge(agent("--exit", "3"));
    const res = await chat(failing, user("SECRET-PROMPT-TEXT"));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("exited with code 3");
    expect(text.includes("SECRET-PROMPT-TEXT")).toBe(false);

    const empty = bridge(agent("--empty"));
    expect((await chat(empty, user("x"))).status).toBe(502);

    const missing = bridge(["/nonexistent/agent-cli"]);
    expect((await chat(missing, user("x"))).status).toBe(502);
  });

  test("a call past the timeout is killed and answered with 504", async () => {
    const dir = scratch();
    const pid = join(dir, "pid");
    const b = bridge(agent("--pid", pid, "--sleep", "30000"), 1000);
    const started = Date.now();
    const res = await chat(b, user("x"));
    expect(res.status).toBe(504);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(alive(Number(readFileSync(pid, "utf8")))).toBe(false);
  });

  test("a client that hangs up stops the call", async () => {
    const dir = scratch();
    const pid = join(dir, "pid");
    const b = bridge(agent("--pid", pid, "--sleep", "30000"), 60_000);
    const controller = new AbortController();
    const pending = chat(b, user("x"), {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    }).catch(() => "aborted");
    while (!existsSync(pid)) await Bun.sleep(20);
    controller.abort();
    expect(await pending).toBe("aborted");
    const child = Number(readFileSync(pid, "utf8"));
    for (let i = 0; i < 100 && alive(child); i++) await Bun.sleep(50);
    expect(alive(child)).toBe(false);
  });

  test("a call longer than Bun's 10-second idle timeout gets its answer", async () => {
    const b = bridge(agent("--sleep", "11000"), 30_000);
    const res = await chat(b, user('ANSWER: "late"'));
    expect(res.status).toBe(200);
  }, 20_000);
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
