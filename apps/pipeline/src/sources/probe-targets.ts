import { LAUNCH_GROUPS } from "./launch-groups.ts";
import type { ProbeTarget } from "./probe.ts";

/** One representative URL for every launch fetch group (see launch-groups.ts). */
export const PROBE_TARGETS: readonly ProbeTarget[] = LAUNCH_GROUPS.map((g) => ({
  groupId: g.id,
  url: g.probeUrl,
}));
