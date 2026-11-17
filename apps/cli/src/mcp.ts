// Minimal MCP server (stdio), ported from radar/mcp_server.py.
//
// Tools so any MCP-capable agent can drive the radar:
//
//   radar_scan     {edition: "morning"|"evening"} -> per-source status
//                  (grading stays with the calling agent, per SKILL.md)
//   radar_review   {} -> topics due for the 14-day review
//   radar_board    {limit?} -> current board: topics ranked by their
//                  latest heat, with plugin sub-scores/entities inline
//   radar_topic    {query} -> one topic's full appearance history
//   radar_editions {} -> the stored editions (date, slot, item count)
//
// Plugin-P3: enabled code plugins with a `tools` slot add their own
// tools, exposed as `<plugin-id>__<tool-name>` (e.g. momentum__top).
// Plugin tools are read-only by convention of the slot contract —
// handlers receive the assembled site and return data; the write
// paths stay with the CLI commands and radar_scan.
//
// Differences from the Python server, by design (Phase 4): the
// serverInfo is breaker-delta/0.21.0 (was triple-sigma/0.5.1), and
// the config / state come from the CLI's --data-dir (or
// BD_DATA_DIR) instead of the process working directory.

import { dueForReview, loadStore } from "@breaker-delta/core";
import { runScan, summaryLines } from "@breaker-delta/fetchers";

import { loadCliConfig, statePath, VERSION, type CliContext } from "./context.js";
import { buildToolSite, loadPluginTools, type LoadedPluginTool } from "./plugins-code.js";
import * as path from "node:path";

export const PROTOCOL_VERSION = "2024-11-05";

export const TOOLS = [
  {
    name: "radar_scan",
    description:
      "Run one edition's fetch layer: scan all layered sources, " +
      "write state/candidates-<date>-<edition>.json, return " +
      "per-source status and possible cross-source resonance.",
    inputSchema: {
      type: "object",
      properties: { edition: { type: "string", enum: ["morning", "evening"] } },
      required: ["edition"],
    },
  },
  {
    name: "radar_review",
    description: "List topics whose 14-day review is due (see methodology).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "radar_board",
    description:
      "Current board: every tracked topic ranked by its latest " +
      "appearance's heat, with level, heat delta, appearance count " +
      "and any plugin sub-scores / entities stored on the latest " +
      "appearance. Optional limit (default 20, max 100).",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "radar_topic",
    description:
      "One topic in full: appearance history (date, slot, heat, " +
      "level, sources) plus the latest appearance's plugin data. " +
      "Query matches a slug exactly or a title substring.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "radar_editions",
    description: "List the stored editions: date, slot, item count, title.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ------------------------------------------------------------ site cache

type ToolSite = ReturnType<typeof buildToolSite>;
let siteCache: ToolSite | null = null;
function site(ctx: CliContext): ToolSite {
  if (!siteCache) siteCache = buildToolSite(ctx);
  return siteCache;
}

// ------------------------------------------------------- plugin tool registry

let pluginToolsCache: Promise<LoadedPluginTool[]> | null = null;
function pluginTools(ctx: CliContext): Promise<LoadedPluginTool[]> {
  if (!pluginToolsCache) {
    pluginToolsCache = (async () => {
      const { config } = loadCliConfig(ctx);
      return loadPluginTools(ctx, config as Record<string, unknown>);
    })();
  }
  return pluginToolsCache;
}

async function allTools(ctx: CliContext): Promise<unknown[]> {
  const plugs = await pluginTools(ctx);
  return [
    ...TOOLS,
    ...plugs.map((p) => ({
      name: p.exposedName,
      description: p.def.description,
      inputSchema: p.def.inputSchema,
    })),
  ];
}

export async function callTool(
  ctx: CliContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (name === "radar_scan") {
    const { config } = loadCliConfig(ctx);
    const edition = typeof args.edition === "string" ? args.edition : "morning";
    const report = await runScan(edition, config, {
      baseDir: ctx.dataDir,
      stateDir: path.join(ctx.dataDir, "state"),
      env: process.env,
    });
    return summaryLines(report).join("\n");
  }
  if (name === "radar_review") {
    const data = loadStore(statePath(ctx));
    const due = dueForReview(data);
    if (due.length === 0) return "No topics due for review.";
    return due.map((t) => `- ${t.name} (first seen ${t.first_seen})`).join("\n");
  }
  if (name === "radar_board") {
    const limit = Math.min(Math.max(typeof args.limit === "number" ? args.limit : 20, 1), 100);
    const rows = site(ctx)
      .topics.map((t) => ({ t, last: t.apps[t.apps.length - 1] }))
      .filter((r) => r.last)
      .sort((a, b) => (b.last.heat ?? 0) - (a.last.heat ?? 0))
      .slice(0, limit);
    if (rows.length === 0) return "No topics yet.";
    return rows
      .map(({ t, last }, i) => {
        const extras: string[] = [];
        if (last.heat_delta !== null && last.heat_delta !== undefined) {
          extras.push(`Δheat ${last.heat_delta >= 0 ? "+" : ""}${last.heat_delta}`);
        }
        extras.push(`apps ${t.apps.length}`);
        for (const [pid, ns] of Object.entries(last.plugins ?? {})) {
          if (typeof ns?.score === "number") extras.push(`${pid} ${ns.score}`);
          const ents = (ns as { entities?: { name?: unknown }[] })?.entities;
          if (Array.isArray(ents) && ents.length > 0) {
            extras.push(ents.map((e) => String(e.name ?? "")).filter(Boolean).join("/"));
          }
        }
        return `#${i + 1} ${t.name} — heat ${last.heat} · ${last.level ?? "?"} · ${extras.join(" · ")}`;
      })
      .join("\n");
  }
  if (name === "radar_topic") {
    const q = typeof args.query === "string" ? args.query : "";
    if (!q) throw new Error("radar_topic: query is required");
    const topics = site(ctx).topics;
    const t =
      topics.find((x) => x.slug === q) ??
      topics.find((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    if (!t) return `No topic matches "${q}".`;
    const lines = [
      `${t.name} (slug: ${t.slug})`,
      `appearances: ${t.apps.length} · first ${t.apps[0]?.date ?? "?"} · latest ${t.apps[t.apps.length - 1]?.date ?? "?"}`,
      ...t.apps.map(
        (a) =>
          `- ${a.date} ${a.slot ?? ""} heat ${a.heat} · ${a.level ?? "?"} · sources: ${a.sources.join(", ")}`,
      ),
    ];
    const last = t.apps[t.apps.length - 1];
    if (last?.plugins && Object.keys(last.plugins).length > 0) {
      lines.push(`plugins (latest): ${JSON.stringify(last.plugins)}`);
    }
    return lines.join("\n");
  }
  if (name === "radar_editions") {
    const eds = site(ctx).editions;
    if (eds.length === 0) return "No editions stored.";
    return eds
      .map((e) => {
        const ed = e as unknown as { date?: string; slot?: string; title?: string; items?: unknown[] };
        return `- ${ed.date ?? "?"} ${ed.slot ?? ""} · ${ed.items?.length ?? 0} items${ed.title ? ` · ${ed.title}` : ""}`;
      })
      .join("\n");
  }
  const plugs = await pluginTools(ctx);
  const plug = plugs.find((p) => p.exposedName === name);
  if (plug) {
    const result = await plug.def.call(args, site(ctx));
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  }
  throw new Error(`unknown tool: ${name}`);
}

interface JsonRpcMessage {
  method?: string;
  id?: unknown;
  params?: { name?: string; arguments?: Record<string, unknown> };
  [key: string]: unknown;
}

export async function handleMessage(
  ctx: CliContext,
  message: JsonRpcMessage,
): Promise<Record<string, unknown> | null> {
  const method = message.method;
  const msgId = message.id;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msgId,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "breaker-delta", version: VERSION },
      },
    };
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id: msgId, result: {} };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id: msgId, result: { tools: await allTools(ctx) } };
  }
  if (method === "tools/call") {
    const params = message.params ?? {};
    try {
      const text = await callTool(ctx, params.name ?? "", params.arguments ?? {});
      return {
        jsonrpc: "2.0",
        id: msgId,
        result: { content: [{ type: "text", text }], isError: false },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: msgId,
        result: {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        },
      };
    }
  }
  if (msgId !== undefined && msgId !== null) {
    return {
      jsonrpc: "2.0",
      id: msgId,
      error: { code: -32601, message: `method not found: ${method}` },
    };
  }
  return null; // notification
}

export async function runMcp(ctx: CliContext): Promise<number> {
  let buffer = "";
  let chain: Promise<void> = Promise.resolve();
  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    chain = chain.then(async () => {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        return; // like Python: undecodable lines are skipped
      }
      const response = await handleMessage(ctx, message);
      if (response !== null) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    });
  };
  await new Promise<void>((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        processLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
      }
    });
    process.stdin.on("end", () => resolve());
  });
  if (buffer.trim()) processLine(buffer);
  await chain;
  return 0;
}
