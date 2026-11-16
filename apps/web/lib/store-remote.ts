// Remote backend: the data directory is a public git repo (the
// official instance's data repo), read over HTTPS at request time.
// This is the Workers shape — no filesystem, no database: the repo
// stays the single source of truth, the scan flow keeps pushing
// edition files exactly as it does for the static build, and this
// store picks them up within the data cache TTL (see data.ts).
//
// Layout expected under BD_DATA_BASE (a raw-content base URL such
// as https://raw.githubusercontent.com/<owner>/<repo>/main):
//   editions.json            {"editions": ["2026-11-11-pilot.json", ...]}
//   editions/<name>          edition JSON files
//   state/seen-topics.json   the ledger ({"topics": [...]})
//   config.yaml              optional
//   track-record.md          optional
// The manifest exists because raw content hosts cannot list a
// directory; the scan jobs regenerate it whenever they add an
// edition.

import type { StoreTopic } from "@breaker-delta/core";

import { editionsFromFiles, parseConfigText, type SiteStore, type StoreData } from "./store";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`remote data: GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchTextOrNull(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`remote data: GET ${url} -> ${res.status}`);
  return res.text();
}

export class RemoteStore implements SiteStore {
  constructor(private base: string) {}

  async load(): Promise<StoreData> {
    const base = this.base.replace(/\/+$/, "");
    const manifest = JSON.parse(await fetchText(`${base}/editions.json`)) as {
      editions?: unknown;
    };
    if (!Array.isArray(manifest.editions)) {
      throw new Error("remote data: editions.json has no editions[] list");
    }
    const names = manifest.editions.filter((n): n is string => typeof n === "string");
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        text: await fetchText(`${base}/editions/${name}`),
      })),
    );
    const editions = editionsFromFiles(files);
    const ledgerText = await fetchTextOrNull(`${base}/state/seen-topics.json`);
    const ledger = (
      ledgerText ? (JSON.parse(ledgerText) as { topics?: StoreTopic[] }).topics ?? [] : []
    ) as StoreTopic[];
    const configText = await fetchTextOrNull(`${base}/config.yaml`);
    const trackRecord = await fetchTextOrNull(`${base}/track-record.md`);
    return {
      editions,
      ledger,
      config: parseConfigText(configText),
      configText,
      trackRecord,
      topics: null,
    };
  }
}
