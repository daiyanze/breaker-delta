// Path-based track-record loading. The Markdown parsing itself is
// pure and stays in @breaker-delta/core (parseTrackRecord); this is
// the file-reading wrapper, moved in Rewrite Phase 1.

import * as fs from "node:fs";

import { emptyTrackData, parseTrackRecord, type TrackData } from "@breaker-delta/core";

export function parseTrackRecordFile(filePath: string): TrackData {
  if (!fs.existsSync(filePath)) return emptyTrackData();
  return parseTrackRecord(fs.readFileSync(filePath, "utf-8"));
}
