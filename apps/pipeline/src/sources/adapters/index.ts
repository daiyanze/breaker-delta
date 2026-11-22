/** Every adapter, by fetch group id. A group without an entry is not fetched yet. */
import type { Adapter } from "../adapter.ts";
import { lobsters } from "./lobsters.ts";

export const ADAPTERS: Readonly<Record<string, Adapter>> = {
  [lobsters.groupId]: lobsters,
};
