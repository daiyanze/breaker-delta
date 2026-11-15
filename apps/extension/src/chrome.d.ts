// Minimal ambient declarations for the Chrome extension APIs this
// extension uses. devDependencies carry no @types/chrome (the
// migration spec pins runtime dependencies to zero and types to the
// compiler only), so the used surface is declared here with just
// enough typing for strict mode. Runtime behaviour is Chrome's own.

declare const chrome: {
  storage: {
    local: {
      get(key: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    query(queryInfo: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<Array<{ id?: number; title?: string; url?: string }>>;
    create(details: { url: string; active?: boolean }): Promise<unknown>;
  };
  scripting: {
    executeScript(injection: {
      target: { tabId: number };
      func: () => string;
    }): Promise<Array<{ result?: unknown }>>;
  };
  runtime: {
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
    sendMessage(message: unknown): Promise<unknown>;
    onInstalled: { addListener(callback: () => void): void };
    onStartup: { addListener(callback: () => void): void };
    onMessage: {
      addListener(
        callback: (message: { type?: string; urls?: string[] }) => void,
      ): void;
    };
  };
  action: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  };
};
