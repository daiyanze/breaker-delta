/**
 * A small reader for the stylesheet `uiCss()` writes, so its tests check
 * rules and declarations instead of matching text. It reads blocks,
 * declarations, statements such as `@layer a, b;`, nesting and comments;
 * nothing a browser would read differently in the files of this package.
 * Text it cannot close (a brace or a string left open) throws.
 */

export interface CssBlock {
  /** The selector or at-rule before `{`; `""` for the sheet itself. */
  prelude: string;
  declarations: readonly (readonly [property: string, value: string])[];
  /** Nested blocks, and statements (`@layer a, b;`) with no block. */
  children: readonly CssBlock[];
  /** True for a statement such as `@layer a, b;`. */
  statement?: true;
}

/** Collapse whitespace and drop it next to `,`, `(` and `)`, so `minmax(0, 1fr)` reads as `minmax(0,1fr)`. */
export function normalize(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*([,()])\s*/g, "$1")
    .replace(/\)(?=[^\s,)])/g, ") ")
    .trim();
}

/** A selector or an at-rule's prelude: whitespace collapsed only. */
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

export function parseCss(text: string): CssBlock {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  function block(prelude: string, top: boolean): CssBlock {
    const declarations: [string, string][] = [];
    const children: CssBlock[] = [];
    let buffer = "";
    const flush = () => {
      const t = buffer.trim();
      buffer = "";
      if (t === "") return;
      if (t.startsWith("@")) {
        children.push({ prelude: squash(t), declarations: [], children: [], statement: true });
        return;
      }
      const colon = t.indexOf(":");
      if (colon === -1) throw new Error(`not a declaration: "${t}"`);
      declarations.push([t.slice(0, colon).trim().toLowerCase(), normalize(t.slice(colon + 1))]);
    };
    while (i < source.length) {
      const c = source[i] as string;
      i += 1;
      if (c === '"' || c === "'") {
        const end = source.indexOf(c, i);
        if (end === -1) throw new Error("a string is not closed");
        buffer += source.slice(i - 1, end + 1);
        i = end + 1;
      } else if (c === "{") {
        const childPrelude = squash(buffer);
        buffer = "";
        children.push(block(childPrelude, false));
      } else if (c === "}") {
        if (top) throw new Error("a `}` closes nothing");
        flush();
        return { prelude, declarations, children };
      } else if (c === ";") {
        flush();
      } else {
        buffer += c;
      }
    }
    if (!top) throw new Error(`the block "${prelude}" is not closed`);
    flush();
    return { prelude, declarations, children };
  }
  return block("", true);
}

/** One style rule with where it sits: its layer, the media queries around it, its full selector. */
export interface CssRule {
  layer: string | null;
  media: readonly string[];
  selector: string;
  declarations: readonly (readonly [string, string])[];
}

/** Every style rule and `@font-face` of a sheet, nesting resolved (`&`, or a descendant). */
export function cssRules(sheet: CssBlock): CssRule[] {
  const out: CssRule[] = [];
  const walk = (b: CssBlock, layer: string | null, media: string[], selector: string | null) => {
    for (const child of b.children) {
      if (child.statement) continue;
      const p = child.prelude;
      if (p.startsWith("@layer ")) {
        walk(child, p.slice(7).trim(), media, selector);
      } else if (p.startsWith("@media ")) {
        const inner = [...media, normalize(p.slice(7))];
        if (selector !== null && child.declarations.length > 0) {
          out.push({ layer, media: inner, selector, declarations: child.declarations });
        }
        walk(child, layer, inner, selector);
      } else if (p.startsWith("@")) {
        out.push({ layer, media, selector: p, declarations: child.declarations });
      } else {
        const full =
          selector === null
            ? p
            : p.includes("&")
              ? p.replaceAll("&", selector)
              : `${selector} ${p}`;
        out.push({ layer, media, selector: full, declarations: child.declarations });
        walk(child, layer, media, full);
      }
    }
  };
  walk(sheet, null, [], null);
  return out;
}

/** The value of `property` in a rule, or undefined. The last one wins, as in a browser. */
export function cssValue(
  rule: Pick<CssRule, "declarations">,
  property: string,
): string | undefined {
  return rule.declarations.filter(([p]) => p === property).at(-1)?.[1];
}
