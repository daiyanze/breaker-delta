/**
 * The publish step (M1-19, #35): tell the site which topics this run changed,
 * so it drops their cached pages. ADR 0009: the publish step only purges
 * caches; share cards are drawn on request, not here.
 *
 * - **Topics.** Every topic commit gave a new version or a discarded draft,
 *   in commit's order, each once. The request carries the slot and those
 *   ids, nothing else (invariant 6).
 * - **Port.** The site is reached through the `SiteCache` port: the local
 *   site in the same process, or RPC over the service binding to bd-web on
 *   Cloudflare. The site only reads (invariant 7).
 * - **Failure.** A purge that throws fails the attempt; the runner retries
 *   it up to `stepMaxAttempts` times (settings), then marks the run failed.
 *   Purging twice is harmless, so a retried or resumed attempt sends the same
 *   request again.
 *
 * The call is made even when no topic changed: the front page and the run's
 * "edition" move with every run. The output holds counts only.
 */
import type { SiteCache } from "@bd/ports";
import type { CommitOutput } from "./commit.ts";
import type { Step } from "./runner.ts";
import { outputOf } from "./summarize.ts";

export interface PublishDeps {
  site: SiteCache;
}

/** What the step returns; the runner stores it in `run_steps.output`. */
export interface PublishOutput {
  /** Topics named in the purge request. */
  topics: number;
  /** Cached entries the site reports it dropped. */
  purged: number;
}

export function publishStep(deps: PublishDeps): Step {
  return {
    name: "publish",
    async run(ctx): Promise<PublishOutput> {
      const { published, discarded } = outputOf<CommitOutput>(ctx, "commit");
      const topicIds = [...new Set([...published, ...discarded])];
      const { purged } = await deps.site.purge({ slot: ctx.slot, topicIds });
      return { topics: topicIds.length, purged };
    },
  };
}
