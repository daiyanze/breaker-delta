// next/link shim for the static prerender (Rewrite Phase 3c):
// a Link is an anchor; the prerender's post-processing rewrites
// the web href scheme to the static file scheme afterwards.

import type { AnchorHTMLAttributes, ReactNode } from "react";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
}

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
