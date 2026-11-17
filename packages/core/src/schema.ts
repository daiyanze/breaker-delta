// Minimal schema system (Rewrite Phase 0, design doc §4.2): a schema
// is plain data describing a cross-boundary shape. One descriptor
// drives both the TypeScript type (Infer<>, compile-time only) and
// the runtime validator (validate()). Zero dependencies; descriptors
// are auditable, and validation happens once at each boundary (file
// reads, push/MCP inputs, plugin outputs).
//
// The builders are generic on purpose: they preserve the concrete
// descriptor shape in the type, which is what makes Infer<> terminate
// and stay exact. Annotating a concrete schema as the erased `Schema`
// union would lose that (and make Infer<> recurse forever) — don't.
//
// Objects are OPEN by default: named fields are checked, extra keys
// ride along untouched — the same posture as the core interfaces'
// index signatures.

export type Schema =
  | { kind: "string"; minLength?: number }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "unknown" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "array"; items: Schema }
  | { kind: "record"; values: Schema }
  | { kind: "object"; fields: Record<string, Schema> }
  | { kind: "opt"; inner: Schema }
  | { kind: "nullable"; inner: Schema }
  | { kind: "union"; anyOf: readonly Schema[] };

export const str = (minLength?: number): { kind: "string"; minLength?: number } =>
  minLength === undefined ? { kind: "string" } : { kind: "string", minLength };
export const num = (): { kind: "number" } => ({ kind: "number" });
export const bool = (): { kind: "boolean" } => ({ kind: "boolean" });
export const nul = (): { kind: "null" } => ({ kind: "null" });
export const unk = (): { kind: "unknown" } => ({ kind: "unknown" });
export const lit = <V extends string | number | boolean | null>(value: V): { kind: "literal"; value: V } =>
  ({ kind: "literal", value });
export const enm = <V extends string[]>(...values: V): { kind: "enum"; values: V } => ({ kind: "enum", values });
export const arr = <I extends Schema>(items: I): { kind: "array"; items: I } => ({ kind: "array", items });
export const rec = <V extends Schema>(values: V): { kind: "record"; values: V } => ({ kind: "record", values });
export const obj = <F extends Record<string, Schema>>(fields: F): { kind: "object"; fields: F } =>
  ({ kind: "object", fields });
export const opt = <I extends Schema>(inner: I): { kind: "opt"; inner: I } => ({ kind: "opt", inner });
export const nullable = <I extends Schema>(inner: I): { kind: "nullable"; inner: I } =>
  ({ kind: "nullable", inner });
export const union = <U extends Schema[]>(...anyOf: U): { kind: "union"; anyOf: U } => ({ kind: "union", anyOf });

// ---- Compile-time type inference -------------------------------------------

type Flatten<T> = { [K in keyof T]: T[K] };
type OptKeys<F> = { [K in keyof F]: F[K] extends { kind: "opt" } ? K : never }[keyof F];
type ReqKeys<F> = Exclude<keyof F, OptKeys<F>>;

export type Infer<S> =
  S extends { kind: "string" } ? string
  : S extends { kind: "number" } ? number
  : S extends { kind: "boolean" } ? boolean
  : S extends { kind: "null" } ? null
  : S extends { kind: "unknown" } ? unknown
  : S extends { kind: "literal"; value: infer V } ? V
  : S extends { kind: "enum"; values: readonly (infer V)[] } ? V
  : S extends { kind: "array"; items: infer I } ? Infer<I>[]
  : S extends { kind: "record"; values: infer V } ? Record<string, Infer<V>>
  : S extends { kind: "nullable"; inner: infer I } ? Infer<I> | null
  : S extends { kind: "opt"; inner: infer I } ? Infer<I>
  : S extends { kind: "union"; anyOf: readonly (infer U)[] } ? Infer<U>
  : S extends { kind: "object"; fields: infer F }
    ? Flatten<{ [K in ReqKeys<F>]: Infer<F[K]> } & { [K in OptKeys<F>]?: Infer<F[K]> }>
  : never;

// ---- Runtime validation ------------------------------------------------------

const MAX_ERRORS = 20;

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function check(schema: Schema, value: unknown, path: string, errors: string[]): void {
  if (errors.length >= MAX_ERRORS) return;
  switch (schema.kind) {
    case "unknown":
      return;
    case "string":
      if (typeof value !== "string") {
        errors.push(`${path}: expected string, got ${typeName(value)}`);
      } else if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${path}: expected string of length >= ${schema.minLength}`);
      }
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push(`${path}: expected number, got ${typeName(value)}`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path}: expected boolean, got ${typeName(value)}`);
      return;
    case "null":
      if (value !== null) errors.push(`${path}: expected null, got ${typeName(value)}`);
      return;
    case "literal":
      if (value !== schema.value) {
        errors.push(`${path}: expected ${JSON.stringify(schema.value)}, got ${JSON.stringify(value)}`);
      }
      return;
    case "enum":
      if (typeof value !== "string" || !schema.values.includes(value)) {
        errors.push(`${path}: expected one of ${schema.values.join("|")}, got ${JSON.stringify(value)}`);
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeName(value)}`);
        return;
      }
      value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
      return;
    case "record":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${typeName(value)}`);
        return;
      }
      for (const [k, v] of Object.entries(value)) check(schema.values, v, `${path}.${k}`, errors);
      return;
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${typeName(value)}`);
        return;
      }
      const rec = value as Record<string, unknown>;
      for (const [key, field] of Object.entries(schema.fields)) {
        const v = rec[key];
        if (field.kind === "opt") {
          if (v !== undefined) check(field.inner, v, `${path}.${key}`, errors);
        } else if (v === undefined) {
          errors.push(`${path}.${key}: missing required field`);
        } else {
          check(field, v, `${path}.${key}`, errors);
        }
      }
      return;
    }
    case "opt":
      // Only meaningful inside object fields; elsewhere treat as inner.
      if (value !== undefined) check(schema.inner, value, path, errors);
      return;
    case "nullable":
      if (value !== null) check(schema.inner, value, path, errors);
      return;
    case "union": {
      for (const branch of schema.anyOf) {
        const branchErrors: string[] = [];
        check(branch, value, path, branchErrors);
        if (branchErrors.length === 0) return;
      }
      errors.push(`${path}: does not match any allowed shape`);
      return;
    }
  }
}

/** Validate `value` against `schema`; returns error strings ([] = ok). */
export function validate(schema: Schema, value: unknown): string[] {
  const errors: string[] = [];
  check(schema, value, "$", errors);
  return errors;
}

export function isValid(schema: Schema, value: unknown): boolean {
  return validate(schema, value).length === 0;
}
