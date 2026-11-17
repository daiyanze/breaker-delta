// A tiny YAML-subset parser, ported line-by-line from
// radar/yamlmini.py (the Python engine's fallback when PyYAML is
// unavailable; production Python prefers PyYAML, and both are tested
// against config.example.yaml for identical output — the golden
// config test here holds this port to the PyYAML result).
//
// Supported subset (exactly yamlmini's corner):
// - comments (# ...) and blank lines
// - nested mappings by indentation
// - block sequences (- item), including sequences of mappings
// - flow sequences ([a, b]) and flow mappings ({a: 1})
// - scalars: plain / single- / double-quoted strings, ints, floats,
//   true/false, null / ~
//
// Anchors, multiline strings (| / >) and tags are NOT supported:
// unlike yamlmini, which would silently misread some of them, this
// port throws on those tokens so a config outside the subset fails
// loudly instead of being read wrong.

function stripComment(line: string): string {
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inD) {
      inS = !inS;
    } else if (ch === '"' && !inS && (i === 0 || line[i - 1] !== "\\")) {
      inD = !inD;
    } else if (ch === "#" && !inS && !inD && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

function splitFlow(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inS = false;
  let inD = false;
  let current = "";
  for (const ch of inner) {
    if (ch === "'" && !inD) {
      inS = !inS;
    } else if (ch === '"' && !inS) {
      inD = !inD;
    } else if (!inS && !inD) {
      if (ch === "[" || ch === "{") {
        depth += 1;
      } else if (ch === "]" || ch === "}") {
        depth -= 1;
      } else if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseIntPy(text: string): number | null {
  // Python int(): optional sign, digits (underscores allowed between
  // digits), surrounding whitespace already stripped by callers.
  if (!/^[+-]?\d(?:_?\d)*$/.test(text)) return null;
  const n = parseInt(text.replace(/_/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function parseFloatPy(text: string): number | null {
  // Python float(): decimal / exponent forms, plus inf/nan spellings.
  if (/^[+-]?(inf|infinity)$/i.test(text)) return text.startsWith("-") ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(text)) return NaN;
  if (!/^[+-]?(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d+)?$/.test(text)) return null;
  if (!/\d/.test(text)) return null;
  const n = parseFloat(text.replace(/_/g, ""));
  return Number.isNaN(n) ? null : n;
}

export function yamlScalar(textRaw: string): unknown {
  const text = textRaw.trim();
  if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") {
    return null;
  }
  if (text === "true" || text === "True" || text === "TRUE") return true;
  if (text === "false" || text === "False" || text === "FALSE") return false;
  if (text === "|" || text === ">" || text.startsWith("|-") || text.startsWith(">-") ||
      text.startsWith("|+") || text.startsWith(">+") || text.startsWith("&") ||
      text.startsWith("*") || text.startsWith("!")) {
    throw new Error(`yaml subset: unsupported construct: ${JSON.stringify(text)}`);
  }
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    // yamlmini's exact replacement order: \" then \n then \\.
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    return inner ? splitFlow(inner).map((p) => yamlScalar(p)) : [];
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    const inner = text.slice(1, -1).trim();
    const out: Record<string, unknown> = {};
    for (const part of splitFlow(inner)) {
      const idx = part.indexOf(":");
      const key = idx >= 0 ? part.slice(0, idx) : part;
      const value = idx >= 0 ? part.slice(idx + 1) : "";
      out[String(yamlScalar(key))] = yamlScalar(value);
    }
    return out;
  }
  const asInt = parseIntPy(text);
  if (asInt !== null) return asInt;
  const asFloat = parseFloatPy(text);
  if (asFloat !== null) return asFloat;
  return text;
}

const KEY_RE = /^([^:\s][^:]*?):(\s+(.*))?$/;

interface YamlLine {
  indent: number;
  content: string;
}

function tokenize(text: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of text.split("\n")) {
    const noComment = stripComment(raw.replace(/\r$/, ""));
    const line = noComment.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.replace(/^ +/, "").length;
    lines.push({ indent, content: line.trim() });
  }
  return lines;
}

function parseBlock(lines: YamlLine[], i: number, indent: number): [unknown, number] {
  if (i >= lines.length) return [null, i];
  if (lines[i].content.startsWith("- ") || lines[i].content === "-") {
    const seq: unknown[] = [];
    while (
      i < lines.length &&
      lines[i].indent === indent &&
      (lines[i].content.startsWith("- ") || lines[i].content === "-")
    ) {
      const content = lines[i].content.slice(1).trim();
      if (!content) {
        const nextIndent = i + 1 < lines.length ? lines[i + 1].indent : indent + 1;
        const [value, nextI] = parseBlock(lines, i + 1, nextIndent);
        seq.push(value);
        i = nextI;
        continue;
      }
      const m = KEY_RE.exec(content);
      if (m && !content.startsWith("[") && !content.startsWith("{") &&
          !content.startsWith('"') && !content.startsWith("'")) {
        const virtual = indent + 2;
        const sub: YamlLine[] = [{ indent: virtual, content }];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          sub.push(lines[j]);
          j += 1;
        }
        const [value] = parseBlock(sub, 0, virtual);
        seq.push(value);
        i = j;
      } else {
        seq.push(yamlScalar(content));
        i += 1;
      }
    }
    return [seq, i];
  }
  const mapping: Record<string, unknown> = {};
  while (
    i < lines.length &&
    lines[i].indent === indent &&
    !lines[i].content.startsWith("- ")
  ) {
    const m = KEY_RE.exec(lines[i].content);
    if (!m) {
      throw new Error(`yamlmini: cannot parse line: '${lines[i].content}'`);
    }
    const key = String(yamlScalar(m[1]));
    const rest = m[3];
    if (rest) {
      mapping[key] = yamlScalar(rest);
      i += 1;
    } else if (i + 1 < lines.length && lines[i + 1].indent > indent) {
      const [value, nextI] = parseBlock(lines, i + 1, lines[i + 1].indent);
      mapping[key] = value;
      i = nextI;
    } else {
      mapping[key] = null;
      i += 1;
    }
  }
  return [mapping, i];
}

/** Parse YAML-subset text (yamlmini.loads equivalent). */
export function parseYamlSubset(text: string): unknown {
  const lines = tokenize(text);
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return value;
}
