// Minimal MCP server (stdio), ported from radar/mcp_server.py.
//
// Exposes the same two tools so any MCP-capable agent can drive
// the radar:
//
//   radar_scan   {edition: "morning"|"evening"} -> per-source status
//                (grading stays with the calling agent, per SKILL.md)
//   radar_review {} -> topics due for the 14-day review
//
// Differences from the Python server, by design (Phase 4): the
// serverInfo is breaker-delta/0.19.0 (was triple-sigma/0.5.1), and
// the config / state come from the CLI's --data-dir (or
// BD_DATA_DIR) instead of the process working directory.

import { dueForReview, loadStore } from "@breaker-delta/core";
import { runScan, summaryLines } from "@breaker-delta/fetchers";

import { loadCliConfig, statePath, VERSION, type CliContext } from "./context.js";
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
];

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
    return { jsonrpc: "2.0", id: msgId, result: { tools: TOOLS } };
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
