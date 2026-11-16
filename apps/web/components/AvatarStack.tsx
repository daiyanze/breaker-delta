import { SOURCE_DOMAINS } from "@breaker-delta/publisher";

import type { Lang } from "../lib/data";
import { srcNameOf } from "../lib/data";

function sumOrd(x: string): number {
  let n = 0;
  for (const ch of x) n += ch.codePointAt(0) ?? 0;
  return n;
}

function firstAlnum(x: string): string {
  for (const ch of x) {
    if (/[A-Za-z0-9]/.test(ch)) return ch;
  }
  return [...x][0] ?? "";
}

/** Source avatar stack (avatarStack in render.ts): favicon images
 * when the static build has them cached; here letter chips are the
 * standing rendering (the dynamic app does not fetch favicons), with
 * the same hue/initial derivation. */
export function AvatarStack({ sources, lang }: { sources: string[]; lang: Lang }) {
  return (
    <span className="avatars">
      {sources.slice(0, 4).map((src, i) => {
        const name = srcNameOf(src, lang);
        const hue = sumOrd(src) % 360;
        void SOURCE_DOMAINS;
        return (
          <span
            key={i}
            className="av"
            style={{ background: `hsl(${hue} 65% 72%)` }}
            title={name}
          >
            {firstAlnum(name)}
          </span>
        );
      })}
      {sources.length > 4 ? <span className="more-n">+{sources.length - 4}</span> : null}
    </span>
  );
}
