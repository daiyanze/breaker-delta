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
 * expression. The parser knows from the grammar; this follows it closely.
 * Identifiers count, contextual keywords used as names (`type`) included,
 * but not `await`, `yield` and `of`; so does a postfix `!`. A `)` counts
 * unless it closes the condition of `if`, `while`, `for` or `with`, and a
 * `}` counts only when it closes an object literal or type, which is told
 * from a block by the token before its `{` (OPENS_OBJECT).
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

/** After `{ type` or `, type`, these mean `type` is the name, not a modifier. */
const NOT_A_NAME = new Set<SyntaxKind>([SyntaxKind.CommaToken, SyntaxKind.CloseBraceToken]);

/** Keywords whose `(...)` is a condition, after which a statement starts. */
const CONTROL = new Set<SyntaxKind>([
  SyntaxKind.IfKeyword,
  SyntaxKind.WhileKeyword,
  SyntaxKind.ForKeyword,
  SyntaxKind.WithKeyword,
]);

/** Tokens after which a `{` opens an object literal or type, not a block. */
const OPENS_OBJECT = new Set<SyntaxKind>([
  SyntaxKind.EqualsToken,
  SyntaxKind.OpenParenToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.CommaToken,
  SyntaxKind.ColonToken,
  SyntaxKind.QuestionToken,
  SyntaxKind.ReturnKeyword,
  SyntaxKind.LessThanToken,
  SyntaxKind.BarToken,
  SyntaxKind.AmpersandToken,
  SyntaxKind.DotDotDotToken,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.BarBarToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.PlusToken,
]);

/** Contextual keywords the scanner calls identifiers that start an expression. */
const BEFORE_EXPRESSION = new Set(["await", "yield", "of"]);

function tokens(source: string): Token[] {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const out: Token[] = [];
  // What each open `{` belongs to: a block or class body, an object literal
  // or type, or a `${` inside a template. A `/` after a block's `}` starts
  // a regular expression; after an object's `}` it divides.
  const braces: ("block" | "object" | "template")[] = [];
  // Whether each open `(` follows `if`, `while`, `for` or `with`: after its
  // `)` a `/` starts a regular expression.
  const parens: boolean[] = [];
  for (;;) {
    let kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    const last = out.at(-1);
    if ((kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) && !last?.ends) {
      kind = scanner.reScanSlashToken();
    }
    let closes: "block" | "object" | "control" | undefined;
    if (kind === SyntaxKind.OpenBraceToken) {
      braces.push(last && OPENS_OBJECT.has(last.kind) ? "object" : "block");
    } else if (kind === SyntaxKind.TemplateHead) {
      braces.push("template");
    } else if (kind === SyntaxKind.CloseBraceToken) {
      const opened = braces.pop();
      if (opened === "template") {
        kind = scanner.reScanTemplateToken(false);
        if (kind === SyntaxKind.TemplateMiddle) braces.push("template");
      } else {
        closes = opened ?? "block";
      }
    } else if (kind === SyntaxKind.OpenParenToken) {
      parens.push(last !== undefined && CONTROL.has(last.kind));
    } else if (kind === SyntaxKind.CloseParenToken && parens.pop()) {
      closes = "control";
    }
    const name = scanner.isIdentifier() && !BEFORE_EXPRESSION.has(scanner.getTokenValue());
    const closesStatement = closes === "block" || closes === "control";
    const bang = kind === SyntaxKind.ExclamationToken && last?.ends === true;
    const ends = !closesStatement && (ENDS_EXPRESSION.has(kind) || name || bang);
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
        t[j + 1] !== undefined &&
        !NOT_A_NAME.has(t[j + 1]?.kind as SyntaxKind) &&
        !isWord(t[j + 1], "as")
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
