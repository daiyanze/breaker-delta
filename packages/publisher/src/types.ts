// Publisher-side shapes: core's Topic/TopicApp plus the board fields
// publish.py attaches while rendering (board_rank, board_rank_delta,
// carried). Objects are the very ones buildTopics returns, mutated in
// place exactly like the Python dicts.

import type { Topic, TopicApp } from "@breaker-delta/core";

export type App = TopicApp & {
  board_rank?: number;
  board_rank_delta?: number | null;
  carried?: boolean;
};

export type PubTopic = Topic & { apps: App[] };

/** One topic's state on one edition's board (publish.py's `states`). */
export interface BoardState {
  topic: PubTopic;
  app: App;
  heat: number;
  carried: boolean;
  rank: number;
  heat_delta: number | null;
  rank_delta: number | null;
}

/** Per-source aggregates for the sources pages (publish.py's `sstat`). */
export interface SourceStat {
  apps: number;
  /** slug -> topic, insertion-ordered like the Python dict. */
  topics: Map<string, PubTopic>;
  last_ei: number;
  first_ei: number;
  eds: Set<number>;
  topic_apps: Map<string, number>;
  topic_last: Map<string, number>;
}
