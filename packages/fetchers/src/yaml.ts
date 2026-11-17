// Compat shim (Rewrite Phase 1b): the YAML subset parser moved to
// @breaker-delta/config, its single home. This re-export keeps
// existing @breaker-delta/fetchers imports working.
export { parseYamlSubset, yamlScalar } from "@breaker-delta/config";
