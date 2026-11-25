/**
 * The local model bridge (#49). Every call runs `fake-agent.ts`, never a
 * real agent CLI, and no test sends fetched text.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_ENV,
  agentEnv,
  BRIDGE_HOST,
  type Bridge,
  bridgeConfig,
  type ChatMessage,
  CLAUDE_TOOLLESS,
  parseChatRequest,
  parseCommand,
  renderPrompt,
  runAgent,
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

function bridge(command: string[], timeoutMs = 10_000, env?: Record<string, string>) {
  const b = startBridge({ command, port: 0, timeoutMs, log: quiet, ...(env ? { env } : {}) });
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
  const args = CLAUDE_TOOLLESS.slice(1);

  test("the documented claude command passes, in any order and either spelling", () => {
    expect(toollessProblem(CLAUDE_TOOLLESS)).toBeNull();
    expect(toollessProblem(["/opt/bin/claude.exe", ...args])).toBeNull();
    const equals = [
      "-p",
      "--no-session-persistence",
      "--tools=",
      "--disable-slash-commands",
      "--setting-sources=",
      "--strict-mcp-config",
    ];
    expect(toollessProblem(["claude", ...equals])).toBeNull();
  });

  test("--model with a name is the one other flag allowed", () => {
    expect(toollessProblem([...CLAUDE_TOOLLESS, "--model", "sonnet"])).toBeNull();
    expect(toollessProblem([...CLAUDE_TOOLLESS, "--model=sonnet"])).toBeNull();
    for (const bad of [["--model"], ["--model", ""], ["--model", "--tools"], ["--model="]]) {
      expect(toollessProblem([...CLAUDE_TOOLLESS, ...bad])).not.toBeNull();
    }
    const twice = [...CLAUDE_TOOLLESS, "--model", "a", "--model", "b"];
    expect(toollessProblem(twice)).toContain("more than once");
  });

  test("a claude command missing any required flag is refused, by name", () => {
    const cases: [string, string][] = [
      ["--print", "-p/--print"],
      ["--strict-mcp-config", "--strict-mcp-config"],
      ["--disable-slash-commands", "--disable-slash-commands"],
      ["--no-session-persistence", "--no-session-persistence"],
    ];
    for (const [drop, name] of cases) {
      expect(toollessProblem(["claude", ...args.filter((a) => a !== drop)])).toContain(name);
    }
    expect(toollessProblem(["claude", "--print", "--strict-mcp-config"])).toContain('--tools ""');
  });

  test("tools or settings named a second time, or with a value, are refused", () => {
    for (const extra of [
      ["--tools", "Bash,Edit"],
      ["--tools=Bash"],
      ["--tools", ""],
      ["--tools="],
      ["--setting-sources", "user,project"],
      ["--setting-sources=user"],
      ["--setting-sources", ""],
      ["--print"],
      ["-p"],
      ["--strict-mcp-config"],
    ]) {
      expect({ extra, problem: toollessProblem([...CLAUDE_TOOLLESS, ...extra]) }).toEqual({
        extra,
        problem: expect.any(String),
      });
    }
    // A value in place of the empty one.
    const named = CLAUDE_TOOLLESS.map((a, i) => (i === 3 ? "Bash,Edit" : a));
    expect(toollessProblem(named)).not.toBeNull();
    const settings = CLAUDE_TOOLLESS.map((a, i) => (i === 6 ? "user" : a));
    expect(toollessProblem(settings)).not.toBeNull();
    // --tools as the last argument, with no value at all.
    expect(
      toollessProblem(["claude", ...args.slice(0, 1), ...args.slice(3), "--tools"]),
    ).not.toBeNull();
  });

  test("any flag not in the documented list is refused", () => {
    for (const extra of [
      ["--mcp-config", "x.json"],
      ["--mcp-config=x.json"],
      ["--allowedTools", "Bash"],
      ["--add-dir", "/"],
      ["--dangerously-skip-permissions"],
      ["--settings", "{}"],
      ["--agents", "{}"],
      ["--permission-mode", "bypassPermissions"],
      ["--append-system-prompt", "x"],
      ["--verbose"],
      ["Bash"],
    ]) {
      expect({ extra, problem: toollessProblem([...CLAUDE_TOOLLESS, ...extra]) }).toEqual({
        extra,
        problem: expect.stringContaining("only the flags"),
      });
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

describe("bridgeConfig", () => {
  const command = JSON.stringify(CLAUDE_TOOLLESS);

  test("no command, no bridge", () => {
    expect(bridgeConfig({})).toBeNull();
    expect(bridgeConfig({ BD_BRIDGE_COMMAND: "" })).toBeNull();
  });

  test("defaults: port 8789, 120 seconds", () => {
    expect(bridgeConfig({ BD_BRIDGE_COMMAND: command })).toEqual({
      command: [...CLAUDE_TOOLLESS],
      port: 8789,
      timeoutMs: 120_000,
      passEnv: [],
    });
    const set = bridgeConfig({
      BD_BRIDGE_COMMAND: command,
      BD_BRIDGE_PORT: "0",
      BD_BRIDGE_TIMEOUT_SECONDS: "30",
      BD_BRIDGE_ENV: "FOO, BAR_2",
    });
    expect(set).toMatchObject({ port: 0, timeoutMs: 30_000, passEnv: ["FOO", "BAR_2"] });
  });

  test("a bad port, timeout, variable list or command is refused, naming the variable", () => {
    for (const [name, value] of [
      ["BD_BRIDGE_PORT", "abc"],
      ["BD_BRIDGE_PORT", "-1"],
      ["BD_BRIDGE_PORT", "65536"],
      ["BD_BRIDGE_PORT", "1.5"],
      ["BD_BRIDGE_PORT", ""],
      ["BD_BRIDGE_TIMEOUT_SECONDS", "abc"],
      ["BD_BRIDGE_TIMEOUT_SECONDS", "0"],
      ["BD_BRIDGE_TIMEOUT_SECONDS", "-5"],
      ["BD_BRIDGE_TIMEOUT_SECONDS", "1e9"],
      ["BD_BRIDGE_ENV", "FOO BAR"],
      ["BD_BRIDGE_ENV", "A=B"],
    ] as const) {
      expect(() => bridgeConfig({ BD_BRIDGE_COMMAND: command, [name]: value })).toThrow(name);
    }
    expect(() => bridgeConfig({ BD_BRIDGE_COMMAND: '["claude", "-p"]' })).toThrow("lacks");
    expect(() => bridgeConfig({ BD_BRIDGE_COMMAND: "claude -p" })).toThrow("BD_BRIDGE_COMMAND");
  });
});

describe("agentEnv", () => {
  const launcher = {
    PATH: "/usr/bin",
    HOME: "/home/u",
    PROBE_TOKEN: "probe-secret",
    GROQ_API_KEY: "groq-secret",
    CF_AI_TOKEN: "cf-secret",
    BD_BRIDGE_COMMAND: "[]",
    ANTHROPIC_API_KEY: "the-cli-s-own",
    FOO: "foo",
  };

  test("passes the system variables and the CLI's own sign-in, nothing of the app", () => {
    expect(agentEnv(launcher)).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/u",
      ANTHROPIC_API_KEY: "the-cli-s-own",
    });
  });

  test("docs/providers.md lists every variable the agent gets", () => {
    const doc = readFileSync(join(import.meta.dir, "../../../docs/providers.md"), "utf8");
    const listed = (name: string) =>
      doc.includes(`\`${name}\``) ||
      (name.startsWith("XDG_") && doc.includes("`XDG_*`")) ||
      (/^[a-z_]+$/.test(name) && doc.includes("lower-case forms")) ||
      name === "SYSTEMROOT" ||
      name === "COMSPEC";
    expect(AGENT_ENV.filter((n) => !listed(n))).toEqual([]);
  });

  test("BD_BRIDGE_ENV adds names, never an app secret", () => {
    expect(agentEnv(launcher, ["FOO", "MISSING"])).toMatchObject({ FOO: "foo" });
    expect(() => agentEnv(launcher, ["PROBE_TOKEN"])).toThrow("PROBE_TOKEN");
    expect(() => agentEnv(launcher, ["GROQ_API_KEY"])).toThrow("GROQ_API_KEY");
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

  const posix = process.platform !== "win32";

  test.if(posix)(
    "a timeout kills the whole process tree and answers within the timeout",
    async () => {
      const pid = join(scratch(), "sleeper");
      // sh forks a sleeper that holds stdout open; killing sh alone would leave it.
      const command = ["sh", "-c", `cat >/dev/null; sleep 30 & echo $! > ${pid}; wait`];
      const started = Date.now();
      const result = await runAgent(command, "x", { timeoutMs: 1000, env: agentEnv(process.env) });
      expect(result).toMatchObject({ ok: false, status: 504 });
      expect(Date.now() - started).toBeLessThan(5000);
      const sleeper = Number(readFileSync(pid, "utf8"));
      for (let i = 0; i < 40 && alive(sleeper); i++) await Bun.sleep(50);
      expect(alive(sleeper)).toBe(false);
    },
  );

  test.if(posix)("a client that hangs up kills the whole process tree", async () => {
    const pid = join(scratch(), "sleeper");
    const command = ["sh", "-c", `cat >/dev/null; sleep 30 & echo $! > ${pid}; wait`];
    const b = bridge(command, 60_000);
    const controller = new AbortController();
    const pending = chat(b, user("x"), {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    }).catch(() => "aborted");
    while (!existsSync(pid) || readFileSync(pid, "utf8").trim() === "") await Bun.sleep(20);
    controller.abort();
    expect(await pending).toBe("aborted");
    const sleeper = Number(readFileSync(pid, "utf8"));
    for (let i = 0; i < 100 && alive(sleeper); i++) await Bun.sleep(50);
    expect(alive(sleeper)).toBe(false);
  });

  test.if(posix)("a process the agent leaves behind after answering is killed too", async () => {
    const pid = join(scratch(), "straggler");
    const command = [
      "sh",
      "-c",
      `cat >/dev/null; (sleep 30 >/dev/null 2>&1 & echo $! > ${pid}); echo done`,
    ];
    const result = await runAgent(command, "x", { timeoutMs: 10_000, env: agentEnv(process.env) });
    expect(result).toEqual({ ok: true, text: "done" });
    const straggler = Number(readFileSync(pid, "utf8"));
    for (let i = 0; i < 40 && alive(straggler); i++) await Bun.sleep(50);
    expect(alive(straggler)).toBe(false);
  });

  test.if(posix)("the agent sees only the variables agentEnv passes", async () => {
    const env = agentEnv({ ...process.env, PROBE_TOKEN: "probe-value-123" });
    const b = bridge(["sh", "-c", "cat >/dev/null; env"], 10_000, env);
    const body = (await (await chat(b, user("x"))).json()) as {
      choices: { message: { content: string } }[];
    };
    const names = (body.choices[0]?.message.content ?? "").split("\n").map((l) => l.split("=")[0]);
    expect(names.includes("PROBE_TOKEN")).toBe(false);
    expect(names.includes("PATH")).toBe(true);
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
