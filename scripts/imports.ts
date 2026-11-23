/**
 * Reads the module specifiers a TypeScript file imports, with the scanner
 * from the TypeScript the repository builds with (issue #212, lesson L14).
 * TypeScript 7's parser runs only in its native process, and its API
 * server does not work under Bun, so this walks the scanner's tokens. The
 * scanner skips comments, a `#!` line and the inside of strings; template
 * literals and regular expressions are re-scanned the way the parser does.
 *
 * Read: `import ... from "x"`, `import "x"`, `export ... from "x"`, and
 * `import()`, `require()` and `import.meta.require()` whose first argument
 * is a string or a template without substitutions. `typeOnly` marks
 * `import type` and `export type`, which are erased; under
 * `verbatimModuleSyntax` an inline `import { type X }` is not.
 */
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";

export interface ImportRef {
  spec: string;
  typeOnly: boolean;
}

interface Token {
  kind: SyntaxKind;
  text: string;
  value: string;
}

/**
 * Tokens after which a `/` divides; anywhere else it starts a regular
 * expression. The parser knows from the grammar; this is the usual guess,
 * wrong only after `)` of `if (x) /re/` and the like.
 */
const ENDS_EXPRESSION = new Set<SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.StringLiteral,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);

function tokens(source: string): Token[] {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const out: Token[] = [];
  // What each open `{` belongs to: a block, or a `${` inside a template.
  const braces: ("block" | "template")[] = [];
  for (;;) {
    let kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    const last = out.at(-1)?.kind;
    if (
      (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) &&
      (last === undefined || !ENDS_EXPRESSION.has(last))
    ) {
      kind = scanner.reScanSlashToken();
    } else if (kind === SyntaxKind.OpenBraceToken) {
      braces.push("block");
    } else if (kind === SyntaxKind.TemplateHead) {
      braces.push("template");
    } else if (kind === SyntaxKind.CloseBraceToken && braces.pop() === "template") {
      kind = scanner.reScanTemplateToken(false);
      if (kind === SyntaxKind.TemplateMiddle) braces.push("template");
    }
    out.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  }
  return out;
}

const isString = (t: Token | undefined) =>
  t?.kind === SyntaxKind.StringLiteral || t?.kind === SyntaxKind.NoSubstitutionTemplateLiteral;
const isWord = (t: Token | undefined, word: string) => t?.text === word;

export function readImports(source: string): ImportRef[] {
  const t = tokens(source);
  const out: ImportRef[] = [];
  /** `( "x"` then `,` or `)`, starting at `i`: a call's literal first argument. */
  const callArg = (i: number) =>
    t[i]?.kind === SyntaxKind.OpenParenToken &&
    isString(t[i + 1]) &&
    (t[i + 2]?.kind === SyntaxKind.CommaToken || t[i + 2]?.kind === SyntaxKind.CloseParenToken)
      ? t[i + 1]?.value
      : undefined;
  /** From `i`, the specifier after the statement's `from`, before its end. */
  const fromSpec = (i: number) => {
    let depth = 0;
    for (let j = i; j < t.length; j++) {
      const k = t[j]?.kind;
      if (k === SyntaxKind.OpenBraceToken) depth++;
      if (k === SyntaxKind.CloseBraceToken) depth--;
      if (depth !== 0) continue;
      if (k === SyntaxKind.FromKeyword && isString(t[j + 1])) return t[j + 1]?.value;
      if (k === SyntaxKind.SemicolonToken || k === SyntaxKind.ImportKeyword) return undefined;
    }
    return undefined;
  };

  for (let i = 0; i < t.length; i++) {
    const tok = t[i] as Token;
    const prev = t[i - 1]?.kind;
    if (tok.kind === SyntaxKind.ImportKeyword && prev !== SyntaxKind.DotToken) {
      const next = t[i + 1];
      if (next?.kind === SyntaxKind.OpenParenToken) {
        const spec = callArg(i + 1);
        if (spec !== undefined) out.push({ spec, typeOnly: false });
      } else if (next?.kind === SyntaxKind.DotToken) {
        const meta = isWord(t[i + 2], "meta") && t[i + 3]?.kind === SyntaxKind.DotToken;
        if (meta && isWord(t[i + 4], "require")) {
          const spec = callArg(i + 5);
          if (spec !== undefined) out.push({ spec, typeOnly: false });
        }
      } else if (isString(next)) {
        out.push({ spec: next?.value as string, typeOnly: false });
      } else {
        // `import type from "x"` imports a default named `type`.
        const typeOnly = isWord(next, "type") && t[i + 2]?.kind !== SyntaxKind.FromKeyword;
        const spec = fromSpec(i + 1);
        if (spec !== undefined) out.push({ spec, typeOnly });
      }
    } else if (tok.kind === SyntaxKind.ExportKeyword) {
      let j = i + 1;
      const typeOnly = isWord(t[j], "type");
      if (typeOnly) j++;
      const k = t[j]?.kind;
      if (k === SyntaxKind.OpenBraceToken || k === SyntaxKind.AsteriskToken) {
        const spec = fromSpec(j);
        if (spec !== undefined) out.push({ spec, typeOnly });
      }
    } else if (isWord(tok, "require") && prev !== SyntaxKind.DotToken) {
      const spec = callArg(i + 1);
      if (spec !== undefined) out.push({ spec, typeOnly: false });
    }
  }
  return out;
}
