// A small XML parser, just big enough for the fetch layer's needs.
//
// The Python fetchers use xml.etree.ElementTree. This port covers the
// subset those fetchers actually exercise:
//   - elements, attributes (single/double quoted), text, CDATA
//   - comments, processing instructions, DOCTYPE (skipped)
//   - entity references: &amp; &lt; &gt; &quot; &apos; &#NN; &#xNN;
//   - namespaces: xmlns / xmlns:prefix declarations are resolved so a
//     node's `tag` is the ElementTree-style expanded name
//     "{uri}local" (or plain "local" when no namespace applies)
//
// Deliberately NOT supported (no fetcher needs them): DTD internal
// subsets with entity definitions, namespace axis queries, XPath
// beyond the direct-child / descendant helpers below. Malformed input
// raises XmlParseError, the analogue of ET.ParseError — fetchers catch
// exactly that class alongside FetchError, like the Python code.

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}

export interface XmlNode {
  /** Expanded name: "{uri}local" or "local". */
  tag: string;
  /** Local part of the tag name. */
  local: string;
  /** Tag name exactly as written in the document (with prefix). */
  rawTag: string;
  /** Attributes by name as written (prefixes kept, entities decoded). */
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Text directly inside this element, before/between children
   *  (ElementTree's .text plus tails, concatenated — for the flat
   *  title/link/description leaves the fetchers read, this is the
   *  whole text content). */
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = parseInt(body.slice(2), 16);
      return Number.isNaN(cp) ? m : String.fromCodePoint(cp);
    }
    if (body.startsWith("#")) {
      const cp = parseInt(body.slice(1), 10);
      return Number.isNaN(cp) ? m : String.fromCodePoint(cp);
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

interface Scanner {
  s: string;
  i: number;
}

function skipMisc(sc: Scanner, nsStack: Map<string, string>[]): void {
  // Skip whitespace, comments, PIs and DOCTYPE between elements.
  for (;;) {
    while (sc.i < sc.s.length && /\s/.test(sc.s[sc.i])) sc.i += 1;
    if (sc.s.startsWith("<!--", sc.i)) {
      const end = sc.s.indexOf("-->", sc.i + 4);
      if (end < 0) throw new XmlParseError("unterminated comment");
      sc.i = end + 3;
    } else if (sc.s.startsWith("<?", sc.i)) {
      const end = sc.s.indexOf("?>", sc.i + 2);
      if (end < 0) throw new XmlParseError("unterminated processing instruction");
      sc.i = end + 2;
    } else if (sc.s.startsWith("<!DOCTYPE", sc.i) || sc.s.startsWith("<!doctype", sc.i)) {
      // Skip to '>', tolerating an internal subset in [ ... ].
      let j = sc.i + 9;
      let depth = 0;
      while (j < sc.s.length) {
        if (sc.s[j] === "[") depth += 1;
        else if (sc.s[j] === "]") depth -= 1;
        else if (sc.s[j] === ">" && depth === 0) break;
        j += 1;
      }
      if (j >= sc.s.length) throw new XmlParseError("unterminated DOCTYPE");
      sc.i = j + 1;
    } else {
      return;
    }
    void nsStack;
  }
}

function parseElement(sc: Scanner, parentNs: Map<string, string>): XmlNode {
  // sc.s[sc.i] === '<', start of an element (not </, <!--, <?, <!).
  sc.i += 1;
  const nameStart = sc.i;
  while (sc.i < sc.s.length && !/[\s/>]/.test(sc.s[sc.i])) sc.i += 1;
  const rawTag = sc.s.slice(nameStart, sc.i);
  if (!rawTag) throw new XmlParseError("empty tag name");
  const attrs: Record<string, string> = {};
  let selfClosing = false;
  for (;;) {
    while (sc.i < sc.s.length && /\s/.test(sc.s[sc.i])) sc.i += 1;
    if (sc.i >= sc.s.length) throw new XmlParseError(`unterminated element <${rawTag}>`);
    if (sc.s.startsWith("/>", sc.i)) {
      sc.i += 2;
      selfClosing = true;
      break;
    }
    if (sc.s[sc.i] === ">") {
      sc.i += 1;
      break;
    }
    const aStart = sc.i;
    while (sc.i < sc.s.length && !/[\s=/>]/.test(sc.s[sc.i])) sc.i += 1;
    const aName = sc.s.slice(aStart, sc.i);
    while (sc.i < sc.s.length && /\s/.test(sc.s[sc.i])) sc.i += 1;
    let aValue = "";
    if (sc.s[sc.i] === "=") {
      sc.i += 1;
      while (sc.i < sc.s.length && /\s/.test(sc.s[sc.i])) sc.i += 1;
      const quote = sc.s[sc.i];
      if (quote !== '"' && quote !== "'") {
        throw new XmlParseError(`attribute ${aName} value must be quoted`);
      }
      const end = sc.s.indexOf(quote, sc.i + 1);
      if (end < 0) throw new XmlParseError(`unterminated attribute ${aName}`);
      aValue = decodeEntities(sc.s.slice(sc.i + 1, end));
      sc.i = end + 1;
    }
    if (aName) attrs[aName] = aValue;
  }
  // Namespace scope for this element.
  const ns = new Map(parentNs);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "xmlns") ns.set("", v);
    else if (k.startsWith("xmlns:")) ns.set(k.slice(6), v);
  }
  const colon = rawTag.indexOf(":");
  let tag: string;
  let local: string;
  if (colon >= 0) {
    const prefix = rawTag.slice(0, colon);
    local = rawTag.slice(colon + 1);
    const uri = ns.get(prefix);
    tag = uri ? `{${uri}}${local}` : rawTag;
  } else {
    local = rawTag;
    const uri = ns.get("");
    tag = uri ? `{${uri}}${local}` : rawTag;
  }
  const node: XmlNode = { tag, local, rawTag, attrs, children: [], text: "" };
  if (selfClosing) return node;
  // Content until the matching close tag.
  for (;;) {
    if (sc.i >= sc.s.length) throw new XmlParseError(`unterminated element <${rawTag}>`);
    if (sc.s.startsWith("</", sc.i)) {
      const end = sc.s.indexOf(">", sc.i + 2);
      if (end < 0) throw new XmlParseError("unterminated close tag");
      const closeName = sc.s.slice(sc.i + 2, end).trim();
      if (closeName !== rawTag) {
        throw new XmlParseError(`mismatched close tag </${closeName}> for <${rawTag}>`);
      }
      sc.i = end + 1;
      return node;
    }
    if (sc.s.startsWith("<![CDATA[", sc.i)) {
      const end = sc.s.indexOf("]]>", sc.i + 9);
      if (end < 0) throw new XmlParseError("unterminated CDATA");
      node.text += sc.s.slice(sc.i + 9, end);
      sc.i = end + 3;
      continue;
    }
    if (sc.s.startsWith("<!--", sc.i)) {
      const end = sc.s.indexOf("-->", sc.i + 4);
      if (end < 0) throw new XmlParseError("unterminated comment");
      sc.i = end + 3;
      continue;
    }
    if (sc.s.startsWith("<?", sc.i)) {
      const end = sc.s.indexOf("?>", sc.i + 2);
      if (end < 0) throw new XmlParseError("unterminated processing instruction");
      sc.i = end + 2;
      continue;
    }
    if (sc.s[sc.i] === "<") {
      node.children.push(parseElement(sc, ns));
      continue;
    }
    const next = sc.s.indexOf("<", sc.i);
    const chunk = next < 0 ? sc.s.slice(sc.i) : sc.s.slice(sc.i, next);
    node.text += decodeEntities(chunk);
    sc.i = next < 0 ? sc.s.length : next;
  }
}

/** Parse a whole XML document; returns the root element. */
export function parseXml(text: string): XmlNode {
  const sc: Scanner = { s: text, i: 0 };
  skipMisc(sc, []);
  if (sc.s[sc.i] !== "<" || sc.s.startsWith("</", sc.i)) {
    throw new XmlParseError("no root element found");
  }
  const root = parseElement(sc, new Map());
  return root;
}

/** Direct children matching a tag spec (expanded "{uri}local" or plain). */
export function findAll(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/** First direct child matching a tag spec, or null. */
export function find(node: XmlNode, tag: string): XmlNode | null {
  return node.children.find((c) => c.tag === tag) ?? null;
}

/**
 * ElementTree findtext for a direct child: the child's text, or null
 * when the child is absent. (An empty child yields "".)
 */
export function findText(node: XmlNode, tag: string): string | null {
  const child = find(node, tag);
  return child === null ? null : child.text;
}

/** All descendants (including self) matching a tag spec, document order —
 *  ElementTree's iter(tag). */
export function iter(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode): void => {
    if (n.tag === tag) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

/** ElementTree-style "./channel/item": direct child path lookup. */
export function findPath(node: XmlNode, ...tags: string[]): XmlNode[] {
  let level: XmlNode[] = [node];
  for (const tag of tags) {
    const next: XmlNode[] = [];
    for (const n of level) next.push(...findAll(n, tag));
    level = next;
  }
  return level;
}
