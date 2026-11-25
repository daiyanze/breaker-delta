/**
 * The local model bridge (ADR 0005, #49): an HTTP service on 127.0.0.1 that
 * answers the OpenAI-compatible `POST /v1/chat/completions` the judge sends,
 * by running ONE call of an agent CLI on this machine per request.
 *
 * The CLI is whatever `BD_BRIDGE_COMMAND` names (an argv as a JSON array),
 * never hard-wired (invariants 8, 9). It gets the conversation on stdin and
 * answers on stdout; nothing is put in its arguments. Fetched text reaches it
 * only as data in that tool-less call (invariant 6), so the command must run
 * the agent with every tool off and nothing to write to:
 *
 * - The command's own flags turn the tools off. For Claude Code the flags
 *   are in `docs/providers.md` ("Local bridge"), and `toollessProblem`
 *   refuses a `claude` command without them. Another CLI is not checked: the
 *   bridge says so when it starts.
 * - Each call runs in a new empty folder, deleted after the call, so even a
 *   CLI that kept a file tool would find no project to read or change.
 * - A request that offers tools (`tools`, `functions`) or asks to stream is
 *   refused, so the bridge only ever stands for a tool-less call.
 *
 * Only this machine can reach it: it binds 127.0.0.1 and nothing else, and
 * answers only requests addressed to 127.0.0.1 or localhost on its port with
 * no `Origin` header, so a web page in a browser cannot use it (a page's
 * request names its own origin; a DNS-rebound name is not localhost).
 *
 * Nothing the CLI prints on stderr is logged or returned: it may repeat the
 * prompt, which holds fetched text. A failure is reported by exit code only.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** The only address the bridge listens on. Not an option. */
export const BRIDGE_HOST = "127.0.0.1";

export interface BridgeOptions {
  /** The agent CLI's argv. The prompt goes to its stdin, the answer comes from its stdout. */
  command: readonly string[];
  /** 0 picks a free port. */
  port: number;
  /** A call still running after this long is killed and answered with 504. */
  timeoutMs: number;
  /** The agent's whole environment. Default: `agentEnv(process.env)`. */
  env?: Record<string, string>;
  log?: (line: string) => void;
}

export interface Bridge {
  /** `http://127.0.0.1:<port>`; a provider's `baseUrl` is this plus `/v1`. */
  url: string;
  port: number;
  stop(): Promise<void>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

/** `BD_BRIDGE_COMMAND`: a JSON array of strings, the first one not empty. */
export function parseCommand(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('BD_BRIDGE_COMMAND must be a JSON array of strings, e.g. ["claude", "-p"]');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((a) => typeof a === "string") ||
    parsed[0] === ""
  ) {
    throw new Error("BD_BRIDGE_COMMAND must be a non-empty JSON array of strings");
  }
  return parsed;
}

/**
 * The Claude Code command `docs/providers.md` gives, as `BD_BRIDGE_COMMAND`
 * holds it. `claude --print` answers once and exits; `--tools ""` removes
 * every built-in tool; `--strict-mcp-config` with no `--mcp-config` loads no
 * MCP server; `--setting-sources ""` reads no user, project or local
 * settings, so no hooks, plugins or permissions from them;
 * `--disable-slash-commands` turns skills and commands off;
 * `--no-session-persistence` keeps no transcript of fetched text.
 */
export const CLAUDE_TOOLLESS: readonly string[] = [
  "claude",
  "--print",
  "--tools",
  "",
  "--strict-mcp-config",
  "--setting-sources",
  "",
  "--disable-slash-commands",
  "--no-session-persistence",
];

/**
 * The flags a `claude` command may have: exactly the documented ones, each
 * once, plus `--model <name>`. `--tools` and `--setting-sources` take the
 * empty value only, written `--flag ""` or `--flag=`.
 */
const CLAUDE_FLAGS: readonly { names: readonly string[]; empty?: true; required: boolean }[] = [
  { names: ["-p", "--print"], required: true },
  { names: ["--tools"], empty: true, required: true },
  { names: ["--strict-mcp-config"], required: true },
  { names: ["--setting-sources"], empty: true, required: true },
  { names: ["--disable-slash-commands"], required: true },
  { names: ["--no-session-persistence"], required: true },
];

const ONLY = 'the claude command may have only the flags in docs/providers.md ("Local bridge")';

/** Whether `toollessProblem` can check this command: Claude Code, by its executable's name. */
export function isClaudeCommand(command: readonly string[]): boolean {
  return /^claude(\.exe|\.cmd)?$/i.test(basename(command[0] ?? ""));
}

/**
 * Why `command` is not a tool-less call, or null. For Claude Code the argv
 * must be exactly the documented flags (`CLAUDE_TOOLLESS`), in any order,
 * each once, plus an optional `--model <name>`; anything else is refused,
 * since a second `--tools Bash` or `--setting-sources user` could give
 * tools or settings back. Any other CLI returns null, and the launcher
 * warns that it cannot tell. It reads the argv, not what the CLI does.
 */
export function toollessProblem(command: readonly string[]): string | null {
  if (!isClaudeCommand(command)) return null;
  const args = command.slice(1);
  const seen = new Set<string>();
  const once = (key: string, shown: string): string | null => {
    if (seen.has(key)) return `the claude command has ${shown} more than once`;
    seen.add(key);
    return null;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    const inline = name === arg ? undefined : arg.slice(eq + 1);
    if (name === "--model") {
      const value = inline ?? args[++i];
      if (value === undefined || value === "" || value.startsWith("-")) {
        return "the claude command's --model needs a model name";
      }
      const twice = once("--model", "--model");
      if (twice) return twice;
      continue;
    }
    const flag = CLAUDE_FLAGS.find((f) => f.names.includes(name));
    if (!flag) return `${ONLY}, not ${arg}`;
    if (flag.empty) {
      const value = inline ?? args[++i];
      if (value !== "") return `the claude command's ${name} must be "", not ${value ?? "missing"}`;
    } else if (inline !== undefined) return `${ONLY}, not ${arg}`;
    const twice = once(flag.names.join("/"), flag.names.join("/"));
    if (twice) return twice;
  }
  const missing = CLAUDE_FLAGS.filter((f) => f.required && !seen.has(f.names.join("/")));
  if (missing.length > 0) {
    const names = missing.map((f) => (f.empty ? `${f.names[0]} ""` : f.names.join("/")));
    return `the claude command lacks ${names.join(", ")} (docs/providers.md, "Local bridge")`;
  }
  return null;
}

/** What the launcher reads for the bridge (`apps/local/start.ts`). */
export interface BridgeConfig {
  command: string[];
  port: number;
  timeoutMs: number;
  /** Extra variable names the agent gets (`BD_BRIDGE_ENV`), on top of `agentEnv`'s. */
  passEnv: string[];
}

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The bridge's configuration from the launcher's environment, or null when
 * `BD_BRIDGE_COMMAND` is unset. Throws, naming the variable, on a value it
 * cannot use, so the launcher stops instead of starting a broken bridge.
 */
export function bridgeConfig(
  env: Readonly<Record<string, string | undefined>>,
): BridgeConfig | null {
  if (!env.BD_BRIDGE_COMMAND) return null;
  const command = parseCommand(env.BD_BRIDGE_COMMAND);
  const problem = toollessProblem(command);
  if (problem) throw new Error(problem);
  const int = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    const n = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new Error(`${name} must be a whole number from ${min} to ${max}, not "${raw}"`);
    }
    return n;
  };
  const port = int("BD_BRIDGE_PORT", 8789, 0, 65535);
  // A day at most: AbortSignal.timeout takes milliseconds up to 2^32 - 1.
  const timeoutMs = int("BD_BRIDGE_TIMEOUT_SECONDS", 120, 1, 86_400) * 1000;
  const passEnv = (env.BD_BRIDGE_ENV ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  const bad = passEnv.find((n) => !VAR_NAME.test(n));
  if (bad !== undefined) {
    throw new Error(`BD_BRIDGE_ENV must be variable names separated by commas, not "${bad}"`);
  }
  return { command, port, timeoutMs, passEnv };
}

/**
 * Variables the agent gets from the launcher's environment: what a program
 * needs to run (paths, home, locale, temp folder, proxy and certificates)
 * and Claude Code's own sign-in. Nothing of the app: no `PROBE_TOKEN` or
 * `REPORT_TOKEN`, no provider key, no `BD_*`.
 */
export const AGENT_ENV: readonly string[] = [
  // POSIX
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  // Windows
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "ComSpec",
  "COMSPEC",
  "USERPROFILE",
  "USERNAME",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "TEMP",
  "TMP",
  // Network
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  // Claude Code's own sign-in and configuration
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CONFIG_DIR",
];

/** Names `BD_BRIDGE_ENV` may not pass: the app's own secrets and settings. */
const APP_SECRETS = [
  /^BD_/,
  /^PROBE_TOKEN$/,
  /^REPORT_TOKEN$/,
  /^MODEL_DRIVER$/,
  /^CF_AI_TOKEN$/,
  /^GROQ_API_KEY$/,
  /^GEMINI_API_KEY$/,
  /^CLOUDFLARE_/,
];

/** The agent's environment: `AGENT_ENV` and `extra`, the set ones only. */
export function agentEnv(
  env: Readonly<Record<string, string | undefined>>,
  extra: readonly string[] = [],
): Record<string, string> {
  const refused = extra.find((n) => APP_SECRETS.some((re) => re.test(n)));
  if (refused !== undefined) {
    throw new Error(`BD_BRIDGE_ENV must not pass ${refused} to the agent: it is the app's own`);
  }
  const out: Record<string, string> = {};
  for (const name of [...AGENT_ENV, ...extra]) {
    const value = env[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ROLES = new Set(["system", "user", "assistant"]);

/** The parts of a chat-completions body the bridge uses, or why it refuses it. */
export function parseChatRequest(body: unknown): Parsed<ChatRequest> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "the body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  for (const key of ["tools", "functions", "tool_choice", "function_call"]) {
    if (b[key] !== undefined) return { ok: false, error: "the bridge makes tool-less calls only" };
  }
  if (b.stream === true) return { ok: false, error: "streaming is not supported" };
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array" };
  }
  const messages: ChatMessage[] = [];
  for (const m of b.messages as unknown[]) {
    const { role, content } = (m ?? {}) as Record<string, unknown>;
    if (typeof role !== "string" || !ROLES.has(role) || typeof content !== "string") {
      return { ok: false, error: "each message needs a system, user or assistant role and text" };
    }
    messages.push({ role: role as ChatMessage["role"], content });
  }
  return { ok: true, value: { model: typeof b.model === "string" ? b.model : "", messages } };
}

/**
 * The one text the CLI reads on stdin. A single user message is passed as
 * it is. Anything else (a system message, the judge's repair turn) is
 * written out as a transcript, oldest first, each message in a tag named
 * for its role, and the CLI is asked for the next assistant message.
 */
export function renderPrompt(messages: readonly ChatMessage[]): string {
  const [only] = messages;
  if (messages.length === 1 && only?.role === "user") return only.content;
  const turns = messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join("\n\n");
  return `${turns}\n\nReply with the next assistant message only.`;
}

export type AgentResult =
  | { ok: true; text: string }
  | { ok: false; status: 502 | 504; error: string };

/**
 * Kills the agent and every process it started. POSIX: the agent leads its
 * own process group (`detached`), and the group gets SIGKILL. Windows:
 * `taskkill /T /F` ends the tree under the agent's pid; a process already
 * moved out of that tree (re-parented after its parent exited) is not
 * reached there.
 */
function killTree(pid: number): void {
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/pid", String(pid), "/T", "/F"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group is already gone.
  }
}

/**
 * One call of the CLI: `prompt` on stdin, the answer on stdout, in a new
 * empty folder that is deleted afterwards, with only the variables in
 * `env`. When `timeoutMs` passes or `signal` aborts (the client hung up),
 * the whole process tree is killed and the call ends at once, without
 * waiting for its output. After an answer, anything the agent left running
 * is killed too.
 */
export async function runAgent(
  command: readonly string[],
  prompt: string,
  options: { timeoutMs: number; env: Record<string, string>; signal?: AbortSignal },
): Promise<AgentResult> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let cwd: string | null = null;
  let proc: Bun.Subprocess | null = null;
  try {
    cwd = mkdtempSync(join(tmpdir(), "bd-bridge-"));
    const child = Bun.spawn([...command], {
      cwd,
      env: options.env,
      stdin: new TextEncoder().encode(prompt),
      stdout: "pipe",
      stderr: "ignore",
      detached: true,
    });
    proc = child;
    const stopped = new Promise<"stopped">((resolve) => {
      if (signal.aborted) resolve("stopped");
      signal.addEventListener("abort", () => resolve("stopped"), { once: true });
    });
    const finished = Promise.all([new Response(child.stdout).text(), child.exited]);
    const outcome = await Promise.race([finished, stopped]);
    if (outcome === "stopped") {
      if (timeout.aborted) return { ok: false, status: 504, error: "the agent timed out" };
      return { ok: false, status: 502, error: "the request was cancelled" };
    }
    const [text, code] = outcome;
    if (code !== 0) return { ok: false, status: 502, error: `the agent exited with code ${code}` };
    const answer = text.trim();
    if (answer === "") return { ok: false, status: 502, error: "the agent printed nothing" };
    return { ok: true, text: answer };
  } catch (err) {
    // A spawn error names the program, not the prompt.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `the agent could not start: ${message}` };
  } finally {
    if (proc !== null) {
      killTree(proc.pid);
      // The agent itself ends at once after SIGKILL; reap it so it leaves no zombie.
      await Promise.race([proc.exited, Bun.sleep(2000)]);
    }
    if (cwd !== null) rmSync(cwd, { recursive: true, force: true });
  }
}

const fail = (status: number, message: string) => Response.json({ error: { message } }, { status });

/** Starts the bridge. It keeps no state between requests. */
export function startBridge(options: BridgeOptions): Bridge {
  const log = options.log ?? ((line: string) => console.log(line));
  const command = [...options.command];
  const env = options.env ?? agentEnv(process.env);
  const server = Bun.serve({
    hostname: BRIDGE_HOST,
    port: options.port,
    // A call can take longer than Bun's 10-second default (lesson from #244).
    idleTimeout: 0,
    async fetch(request) {
      const host = request.headers.get("host");
      const port = server.port;
      if (host !== `${BRIDGE_HOST}:${port}` && host !== `localhost:${port}`) {
        return fail(403, "only requests to 127.0.0.1 or localhost are answered");
      }
      if (request.headers.has("origin")) return fail(403, "requests from web pages are refused");
      const path = new URL(request.url).pathname;
      if (path === "/health" && request.method === "GET") return Response.json({ ok: true });
      if (path !== "/v1/chat/completions" && path !== "/chat/completions") {
        return fail(404, "not found");
      }
      if (request.method !== "POST") return fail(405, "POST only");
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return fail(415, "the body must be application/json");
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return fail(400, "the body is not JSON");
      }
      const parsed = parseChatRequest(body);
      if (!parsed.ok) return fail(400, parsed.error);

      const started = Date.now();
      const result = await runAgent(command, renderPrompt(parsed.value.messages), {
        timeoutMs: options.timeoutMs,
        env,
        signal: request.signal,
      });
      const ms = Date.now() - started;
      if (!result.ok) {
        log(`[bridge] call failed after ${ms} ms: ${result.error}`);
        return fail(result.status, result.error);
      }
      log(`[bridge] call answered in ${ms} ms`);
      return Response.json({
        id: `bridge-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: parsed.value.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result.text },
            finish_reason: "stop",
          },
        ],
      });
    },
  });
  return {
    url: `http://${BRIDGE_HOST}:${server.port}`,
    port: server.port ?? options.port,
    async stop() {
      await server.stop(true);
    },
  };
}
