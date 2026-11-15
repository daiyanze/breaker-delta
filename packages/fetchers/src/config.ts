// Config loading, ported from radar/config.py.
//
// Search order (first hit wins): the explicit path, then config.yaml,
// config.yml, config.json, config.example.yaml, config.example.yml,
// config.example.json — relative to the working directory, exactly
// like Python (pass {cwd} to point elsewhere, e.g. a data repo or a
// dual-run sandbox).
//
// YAML goes through the subset parser in yaml.ts (a port of
// radar/yamlmini.py). Production Python prefers PyYAML; the golden
// config test pins this port's output for config.example.yaml to the
// PyYAML result, and configs outside the subset throw instead of
// being silently misread.

import * as fs from "node:fs";
import * as path from "node:path";
import { parseYamlSubset } from "./yaml.js";

export const CONFIG_CANDIDATES = [
  "config.yaml",
  "config.yml",
  "config.json",
  "config.example.yaml",
  "config.example.yml",
  "config.example.json",
];

export function parseYaml(text: string): unknown {
  return parseYamlSubset(text);
}

export function loadConfig(
  configPath?: string | null,
  opts: { cwd?: string } = {},
): Record<string, unknown> {
  const cwd = opts.cwd ?? process.cwd();
  const candidates: (string | null | undefined)[] = [configPath, ...CONFIG_CANDIDATES];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const full = path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf-8");
    if (candidate.endsWith(".yaml") || candidate.endsWith(".yml")) {
      return (parseYaml(text) as Record<string, unknown>) ?? {};
    }
    return JSON.parse(text) as Record<string, unknown>;
  }
  return {};
}
