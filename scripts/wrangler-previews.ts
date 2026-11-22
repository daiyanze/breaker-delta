/**
 * Previews must never reach production data (#11). Wrangler gives a Preview
 * only the bindings in a config's `previews` block, so the rule is about that
 * block: every resource it names is a preview resource (its name ends in
 * `-preview`), and none is a resource the production Worker binds. Wrangler's
 * `previews` block cannot carry cron triggers, so previews have no timer.
 */

/** Keys whose values name a Cloudflare resource in a wrangler config. */
const RESOURCE_KEYS = new Set([
  "database_name",
  "database_id",
  "bucket_name",
  "id",
  "service",
  "namespace",
  "index_name",
  "queue",
]);
/** Of those, the names a human picks, which must say they are for previews. */
const NAME_KEYS = new Set(["database_name", "bucket_name", "service", "queue"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function resources(node: unknown, out: { key: string; value: string }[] = []) {
  if (Array.isArray(node)) for (const v of node) resources(v, out);
  else if (isObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      if (RESOURCE_KEYS.has(k) && typeof v === "string") out.push({ key: k, value: v });
      else resources(v, out);
    }
  }
  return out;
}

/**
 * Problems with the `previews` blocks of `configs` (name -> parsed config).
 * Production resources are collected from every config's top level, so a
 * preview of one Worker cannot bind another Worker's production resource.
 */
export function previewViolations(configs: Record<string, unknown>): string[] {
  const production = new Set<string>();
  for (const config of Object.values(configs)) {
    if (!isObject(config)) continue;
    const { previews: _, env: __, ...top } = config;
    for (const r of resources(top)) production.add(r.value);
  }
  const problems: string[] = [];
  for (const [name, config] of Object.entries(configs)) {
    if (!isObject(config) || config.previews === undefined) continue;
    const previews = config.previews;
    if (isObject(previews) && "triggers" in previews)
      problems.push(`${name}: previews.triggers is set`);
    for (const r of resources(previews)) {
      if (production.has(r.value)) {
        problems.push(`${name}: previews binds production resource ${r.key}=${r.value}`);
      }
      if (NAME_KEYS.has(r.key) && !r.value.endsWith("-preview")) {
        problems.push(`${name}: previews ${r.key}=${r.value} does not end in -preview`);
      }
    }
  }
  return problems;
}
