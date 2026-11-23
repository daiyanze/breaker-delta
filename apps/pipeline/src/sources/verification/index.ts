/**
 * Every verification adapter, by source id. Kept apart from `ADAPTERS`
 * (`adapters/index.ts`), which lists the fetch groups that yield echoes.
 */
import type { VerificationAdapter } from "../verification.ts";
import { wikipediaPageviews } from "./wikipedia-pageviews.ts";

const ALL: readonly VerificationAdapter[] = [wikipediaPageviews];

export const VERIFICATION_ADAPTERS: Readonly<Record<string, VerificationAdapter>> =
  Object.fromEntries(ALL.map((a) => [a.sourceId, a]));
