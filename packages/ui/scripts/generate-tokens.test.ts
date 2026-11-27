import { describe, expect, test } from "bun:test";
import { type DesignTokens, generateTokens, SOURCE, TARGET } from "./generate-tokens.ts";

const source = (await Bun.file(SOURCE).json()) as DesignTokens;
const committed = await Bun.file(TARGET).text();

describe("tokens.gen.ts (L19)", () => {
  test("is what the generator writes from tokens.json today", () => {
    // On failure: `bun run --filter @bd/ui tokens`, and commit the result.
    expect(generateTokens(source)).toBe(committed);
  });

  test("a changed value or a new token shows up as a difference", () => {
    const changed = structuredClone(source);
    const [first] = changed.color.tokens;
    if (first === undefined) throw new Error("tokens.json has colour tokens");
    first.value.dark = "#000000";
    expect(generateTokens(changed)).not.toBe(committed);
    const added = structuredClone(source);
    added.spacing.tokens = [...added.spacing.tokens, { name: "space-9", value: "96px" }];
    const text = generateTokens(added);
    expect(text).toContain('"space-9": "96px"');
    expect(text).not.toBe(committed);
  });
});
