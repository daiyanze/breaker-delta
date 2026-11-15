interface ImportMeta {
  url: string;
}

declare class URL {
  constructor(url: string, base?: string);
  href: string;
}

// Minimal ambient declarations for the Node.js built-ins this package
// uses. The migration spec pins devDependencies to typescript only (no
// @types/node), so the few functions we call are declared here with
// just enough typing for strict mode. Runtime behaviour is Node's own.

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function unlinkSync(path: string): void;
  export function mkdtempSync(prefix: string): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:test" {
  export type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn): void;
}

declare module "node:assert/strict" {
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function strictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function throws(
    fn: () => unknown,
    error?: RegExp | ((err: unknown) => boolean),
    message?: string,
  ): void;
  export function ok(value: unknown, message?: string): void;
}
