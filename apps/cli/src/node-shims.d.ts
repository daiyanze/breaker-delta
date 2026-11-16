interface ImportMeta {
  url: string;
}

declare class URL {
  constructor(url: string, base?: string);
  href: string;
  pathname: string;
  searchParams: { get(name: string): string | null };
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: ArrayBuffer | Uint8Array): string;
}

declare const process: {
  argv: string[];
  pid: number;
  env: Record<string, string | undefined>;
  cwd(): string;
  version: string;
  versions: { bun?: string; node: string };
  execPath: string;
  exitCode: number | undefined;
  exit(code?: number): never;
  on(event: string, listener: () => void): void;
  stdin: {
    setEncoding(encoding: string): void;
    on(event: string, listener: (chunk: string) => void): void;
  };
  stdout: {
    write(text: string): void;
    on(event: string, listener: (err: { code?: string }) => void): void;
  };
  stderr: {
    write(text: string): void;
  };
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: { cancel(): Promise<void> } | null;
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

// Minimal ambient declarations for the Node.js built-ins this package
// uses (executed by Bun). Like the other packages, devDependencies carry no @types/node;
// runtime behaviour is Bun's (Node-compatible APIs).

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    mtimeMs: number;
    size: number;
  };
  export function accessSync(path: string, mode?: number): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function copyFileSync(src: string, dest: string): void;
  export function chmodSync(path: string, mode: number): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function basename(path: string): string;
  export function relative(from: string, to: string): string;
  export function extname(path: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
  export function pathToFileURL(path: string): URL;
}

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      input?: string;
      encoding?: string;
      env?: Record<string, string | undefined>;
      timeout?: number;
    },
  ): SpawnSyncResult;
  export interface ChildProcess {
    kill(signal?: string): void;
    on(event: "exit", listener: () => void): void;
    stdout: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
    stderr: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  }
  export function spawn(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string | undefined>;
      stdio?: string;
    },
  ): ChildProcess;
}

declare function setInterval(fn: () => void, ms: number): { unref(): void };
declare function setTimeout(fn: () => void, ms: number): { unref(): void };
declare function clearInterval(handle: { unref(): void }): void;

declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: "data", listener: (chunk: Uint8Array) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: (err: Error) => void): void;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(data?: string | Uint8Array): void;
  }
  export interface Server {
    listen(port: number, host: string, callback?: () => void): void;
    close(): void;
    address(): { port: number } | null;
  }
  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Server;
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
  export function match(actual: string, regexp: RegExp, message?: string): void;
}
