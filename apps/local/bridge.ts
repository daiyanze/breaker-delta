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

/** Flags a `claude` command must have: print mode, no tools, no MCP, no settings, no skills. */
const CLAUDE_REQUIRED: readonly (readonly string[])[] = [
  ["-p", "--print"],
  ["--tools="],
  ["--strict-mcp-config"],
  ["--setting-sources="],
  ["--disable-slash-commands"],
];

/** Flags that would give a `claude` command tools, folders or settings back. */
const CLAUDE_FORBIDDEN = [
  "--mcp-config",
  "--allowedTools",
  "--allowed-tools",
  "--add-dir",
  "--settings",
  "--agents",
  "--plugin-dir",
  "--dangerously-skip-permissions",
  "--allow-dangerously-skip-permissions",
];

/** Whether `toollessProblem` can check this command: Claude Code, by its executable's name. */
export function isClaudeCommand(command: readonly string[]): boolean {
  return /^claude(\.exe|\.cmd)?$/i.test(basename(command[0] ?? ""));
}

/**
 * Why `command` is not a tool-less call, or null. Checks Claude Code's
 * flags only (`docs/providers.md`); for any other CLI it returns null and
 * the launcher warns that it cannot tell. A guard against a missing flag,
 * not a sandbox: it reads the argv, not what the CLI does.
 */
export function toollessProblem(command: readonly string[]): string | null {
  if (!isClaudeCommand(command)) return null;
  const args = command.slice(1);
  // `--flag ""` and `--flag=` are the same; compare them in one form.
  const flags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    const next = args[i + 1];
    if ((a === "--tools" || a === "--setting-sources") && next !== undefined) {
      flags.push(`${a}=${next}`);
      i++;
    } else flags.push(a);
  }
  const missing = CLAUDE_REQUIRED.filter((any) => !any.some((f) => flags.includes(f)));
  if (missing.length > 0) {
    const names = missing.map((any) =>
      any.map((f) => (f.endsWith("=") ? `${f.slice(0, -1)} ""` : f)).join("/"),
    );
    return `the claude command lacks ${names.join(", ")} (docs/providers.md, "Local bridge")`;
  }
  const extra = flags.filter((f) => CLAUDE_FORBIDDEN.some((x) => f === x || f.startsWith(`${x}=`)));
  if (extra.length > 0) return `the claude command must not have ${extra.join(", ")}`;
  return null;
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
 * One call of the CLI: `prompt` on stdin, the answer on stdout, in a new
 * empty folder that is deleted afterwards. Killed when `timeoutMs` passes or
 * `signal` aborts (the client hung up).
 */
export async function runAgent(
  command: readonly string[],
  prompt: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<AgentResult> {
  const cwd = mkdtempSync(join(tmpdir(), "bd-bridge-"));
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const proc = Bun.spawn([...command], {
      cwd,
      stdin: new TextEncoder().encode(prompt),
      stdout: "pipe",
      stderr: "ignore",
      signal,
      killSignal: "SIGKILL",
    });
    const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (timeout.aborted) return { ok: false, status: 504, error: "the agent timed out" };
    if (signal.aborted) return { ok: false, status: 502, error: "the request was cancelled" };
    if (code !== 0) return { ok: false, status: 502, error: `the agent exited with code ${code}` };
    const answer = text.trim();
    if (answer === "") return { ok: false, status: 502, error: "the agent printed nothing" };
    return { ok: true, text: answer };
  } catch (err) {
    // A spawn error names the program, not the prompt.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `the agent could not start: ${message}` };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const fail = (status: number, message: string) => Response.json({ error: { message } }, { status });

/** Starts the bridge. It keeps no state between requests. */
export function startBridge(options: BridgeOptions): Bridge {
  const log = options.log ?? ((line: string) => console.log(line));
  const command = [...options.command];
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
