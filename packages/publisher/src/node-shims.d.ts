interface ImportMeta {
  url: string;
}

declare class URL {
  constructor(url: string, base?: string);
  href: string;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: ArrayBuffer | Uint8Array): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class Buffer extends Uint8Array {
  static from(data: Uint8Array): Buffer;
  equals(other: Uint8Array): boolean;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

interface FetchInit {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  redirect?: string;
  signal?: unknown;
}

declare function fetch(url: string, init?: FetchInit): Promise<FetchResponse>;

declare const AbortSignal: {
  timeout(milliseconds: number): unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  argv: string[];
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

// Minimal ambient declarations for the Node.js built-ins this package
// uses (executed by Bun). Like the other packages, devDependencies are pinned to
// typescript only (no @types/node); runtime behaviour is Bun's (Node-compatible APIs).

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
  export function unlinkSync(path: string): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function copyFileSync(src: string, dest: string): void;
  export function mkdtempSync(prefix: string): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: Uint8Array | string): Hash;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): Hash;
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
