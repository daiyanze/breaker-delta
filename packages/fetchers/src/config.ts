// Compat shim (Rewrite Phase 1b): config loading moved to
// @breaker-delta/config, its single home. These re-exports keep
// existing @breaker-delta/fetchers imports working.
export { CONFIG_CANDIDATES, loadConfig, parseYaml } from "@breaker-delta/config";
