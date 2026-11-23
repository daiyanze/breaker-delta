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
 * `import type`, `export type` and `typeof import()`, which are erased;
 * under `verbatimModuleSyntax` an inline `import { type X }` is not.
 */
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";

export interface ImportRef {
  spec: string;
  /** `import type`, `export type`, or `typeof import()`: erased, nothing loads. */
  typeOnly: boolean;
  /** How it was written: a statement, `import()`/`require()`, or `import.meta.require()`. */
  form: "statement" | "call" | "meta";
  /** A brace import or export with an inline `type` name, such as `{ type X }`. */
  inlineType: boolean;
}

interface Token {
  kind: SyntaxKind;
  text: string;
  value: string;
  /** Whether a `/` after this token divides (it ends an expression). */
  ends: boolean;
}

/**
 * Tokens after which a `/` divides; anywhere else it starts a regular
 * expression. The parser knows from the grammar; this is the usual guess.
 * Identifiers count, contextual keywords used as names (`type`, `of`)
 * included, and so does a postfix `!`. It is still wrong after the `)` of
 * `if (x) /re/` and after a block's `}`; check-deps reads with Bun's parser
 * first for that reason.
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
    const last = out.at(-1);
    if (
      (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) &&
      !last?.ends
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
    const ends =
      ENDS_EXPRESSION.has(kind) ||
      scanner.isIdentifier() ||
      (kind === SyntaxKind.ExclamationToken && last?.ends === true);
    out.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue(), ends });
  }
  return out;
}

const isString = (t: Token | undefined) =>
  t?.kind === SyntaxKind.StringLiteral || t?.kind === SyntaxKind.NoSubstitutionTemplateLiteral;
const isWord = (t: Token | undefined, word: string) =>
  t?.kind !== SyntaxKind.StringLiteral && t?.value === word;
const isMember = (k: SyntaxKind | undefined) =>
  k === SyntaxKind.DotToken || k === SyntaxKind.QuestionDotToken;

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
  /**
   * From `i`, the specifier after the statement's `from`, before its end,
   * and whether a name in its braces carries an inline `type`.
   */
  const fromSpec = (i: number) => {
    let depth = 0;
    let inlineType = false;
    for (let j = i; j < t.length; j++) {
      const k = t[j]?.kind;
      if (k === SyntaxKind.OpenBraceToken) depth++;
      if (k === SyntaxKind.CloseBraceToken) depth--;
      const opener = t[j - 1]?.kind;
      if (
        depth === 1 &&
        isWord(t[j], "type") &&
        (opener === SyntaxKind.OpenBraceToken || opener === SyntaxKind.CommaToken) &&
        t[j + 1]?.ends
      ) {
        inlineType = true;
      }
      if (depth !== 0) continue;
      if (k === SyntaxKind.FromKeyword && isString(t[j + 1])) {
        return { spec: t[j + 1]?.value as string, inlineType };
      }
      if (k === SyntaxKind.SemicolonToken || k === SyntaxKind.ImportKeyword) return undefined;
    }
    return undefined;
  };

  for (let i = 0; i < t.length; i++) {
    const tok = t[i] as Token;
    const prev = t[i - 1]?.kind;
    const call = (spec: string | undefined, form: "call" | "meta", typeOnly = false) => {
      if (spec !== undefined) out.push({ spec, typeOnly, form, inlineType: false });
    };
    if (tok.kind === SyntaxKind.ImportKeyword && !isMember(prev)) {
      const next = t[i + 1];
      if (next?.kind === SyntaxKind.OpenParenToken) {
        // `typeof import("x")` is a type: nothing loads.
        call(callArg(i + 1), "call", prev === SyntaxKind.TypeOfKeyword);
      } else if (next?.kind === SyntaxKind.DotToken) {
        const meta = isWord(t[i + 2], "meta") && t[i + 3]?.kind === SyntaxKind.DotToken;
        if (meta && isWord(t[i + 4], "require")) call(callArg(i + 5), "meta");
      } else if (isString(next)) {
        const spec = next?.value as string;
        out.push({ spec, typeOnly: false, form: "statement", inlineType: false });
      } else {
        // `import type from "x"` and `import type, { y } from "x"` import a
        // default named `type`.
        const after = t[i + 2]?.kind;
        const named = after === SyntaxKind.FromKeyword || after === SyntaxKind.CommaToken;
        const typeOnly = isWord(next, "type") && !named;
        const found = fromSpec(i + 1);
        if (found) out.push({ ...found, typeOnly, form: "statement" });
      }
    } else if (tok.kind === SyntaxKind.ExportKeyword) {
      let j = i + 1;
      const typeOnly = isWord(t[j], "type");
      if (typeOnly) j++;
      const k = t[j]?.kind;
      if (k === SyntaxKind.OpenBraceToken || k === SyntaxKind.AsteriskToken) {
        const found = fromSpec(j);
        if (found) out.push({ ...found, typeOnly, form: "statement" });
      }
    } else if (isWord(tok, "require") && !isMember(prev)) {
      call(callArg(i + 1), "call");
    }
  }
  return out;
}
