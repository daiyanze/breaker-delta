// next/navigation shim for the static prerender (Rewrite
// Phase 3c): pages only call notFound()/redirect() on invalid
// input, which the prerender never supplies; useRouter appears
// in a client component whose handlers never fire in static
// output.

export function notFound(): never {
  throw new Error("prerender: notFound() called");
}

export function redirect(url: string): never {
  throw new Error(`prerender: redirect(${url}) called`);
}

export function useRouter() {
  return {
    push: (_url: string) => {},
    replace: (_url: string) => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: (_url: string) => {},
  };
}

export function usePathname(): string {
  return "/";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string> {
  return {};
}
