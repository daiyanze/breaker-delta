// Topic store, ported from radar/store.py. The store is a single
// JSON file (default `state/seen-topics.json`). Dates are ISO
// `YYYY-MM-DD` strings, mirroring Python's date.isoformat(); the
// 14-day review comparison is a whole-day difference, like
// Python's date subtraction.

import * as fs from "node:fs";
import * as path from "node:path";
import type { StoreTopic, TopicReview, TopicStore } from "./types.js";

export const DEFAULT_STATE_PATH = path.join("state", "seen-topics.json");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local today as YYYY-MM-DD (Python date.today() is local too). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayDiff(later: string, earlier: string): number {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function loadStore(storePath: string = DEFAULT_STATE_PATH): TopicStore {
  if (!fs.existsSync(storePath)) return { topics: [] };
  const data = JSON.parse(fs.readFileSync(storePath, "utf-8")) as TopicStore;
  data.topics ??= [];
  return data;
}

/** Write the store atomically (temp file + rename), like Python. */
export function saveStore(store: TopicStore, storePath: string = DEFAULT_STATE_PATH): void {
  const directory = path.dirname(path.resolve(storePath));
  fs.mkdirSync(directory, { recursive: true });
  const tmp = path.join(
    directory,
    `.seen-topics-${Date.now()}-${Math.floor(Math.random() * 1e9)}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmp, storePath);
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw err;
  }
}

function emptyReview(firstSeen: string): TopicReview {
  return { due: null, result: null, checked_on: null, _first_seen: firstSeen };
}

/**
 * Insert a topic or update it with the latest sighting. Returns the
 * topic record. `first_seen` never moves once set; `sources`
 * accumulate; every sighting appends to `history`.
 */
export function upsertTopic(
  store: TopicStore,
  name: string,
  sources: string[],
  grade: string,
  today?: string,
): StoreTopic {
  const stamp = today ?? todayLocal();
  for (const topic of store.topics) {
    if (topic.name === name) {
      topic.last_seen = stamp;
      for (const source of sources) {
        if (!topic.sources.includes(source)) topic.sources.push(source);
      }
      topic.history.push({ date: stamp, grade });
      if (topic.review === null || topic.review === undefined) {
        topic.review = emptyReview(topic.first_seen);
      }
      return topic;
    }
  }
  const topic: StoreTopic = {
    name,
    first_seen: stamp,
    last_seen: stamp,
    sources: [...sources],
    history: [{ date: stamp, grade }],
    review: emptyReview(stamp),
  };
  store.topics.push(topic);
  return topic;
}

/** Topics whose 14-day review is due and not yet recorded. */
export function dueForReview(
  store: TopicStore,
  today?: string,
  afterDays = 14,
): StoreTopic[] {
  const stamp = today ?? todayLocal();
  const due: StoreTopic[] = [];
  for (const topic of store.topics) {
    const review = (topic.review ?? {}) as TopicReview;
    if (review.result !== null && review.result !== undefined) continue;
    if (dayDiff(stamp, topic.first_seen) >= afterDays) due.push(topic);
  }
  return due;
}

/** Record a review outcome: "hit" or "miss" (per the 14-day rule). */
export function recordReview(
  store: TopicStore,
  name: string,
  result: string,
  today?: string,
): StoreTopic {
  if (result !== "hit" && result !== "miss") {
    throw new Error("result must be 'hit' or 'miss'");
  }
  const stamp = today ?? todayLocal();
  for (const topic of store.topics) {
    if (topic.name === name) {
      topic.review = {
        due: null,
        result,
        checked_on: stamp,
        _first_seen: topic.first_seen,
      };
      return topic;
    }
  }
  throw new Error(`topic not found: ${name}`);
}
