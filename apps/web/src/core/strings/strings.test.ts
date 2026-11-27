import { describe, expect, test } from "bun:test";
import { type Language, LanguageSchema } from "@bd/contracts";
import { en } from "./en.ts";
import { LANGUAGE_NAMES, placeholders, STRINGS, translator } from "./index.ts";

// #107: every string key exists in every language the site can enable. The
// type check fails first (`zh.ts` and `ja.ts` are typed `Table`); this test
// fails too, so a table that reaches the site another way is still caught.

/** What is wrong with the tables, against the English one: keys, empty text, `{names}`. */
function problems(tables: Readonly<Record<string, Readonly<Record<string, string>>>>): string[] {
  const out: string[] = [];
  const keys = Object.keys(en);
  for (const [lang, table] of Object.entries(tables)) {
    for (const key of keys) {
      const text = table[key];
      if (text === undefined) {
        out.push(`${lang}: missing ${key}`);
        continue;
      }
      if (text.trim() === "") out.push(`${lang}: ${key} is empty`);
      const want = placeholders(en[key as keyof typeof en]).sort();
      const got = placeholders(text).sort();
      if (want.join() !== got.join()) out.push(`${lang}: ${key} has {${got}}, not {${want}}`);
    }
    for (const key of Object.keys(table)) {
      if (!(key in en)) out.push(`${lang}: ${key} is not an English key`);
    }
  }
  return out;
}

describe("string tables", () => {
  test("there is a table for every language the settings can enable", () => {
    expect(Object.keys(STRINGS).sort()).toEqual([...LanguageSchema.options].sort());
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...LanguageSchema.options].sort());
  });

  test("every key is in every table, with text and the English {names}", () => {
    expect(problems(STRINGS)).toEqual([]);
  });

  test("a missing key, an extra key, an empty string or a lost {name} is reported", () => {
    const { "front.name": _dropped, ...rest } = STRINGS.zh;
    const planted = {
      zh: rest,
      ja: { ...STRINGS.ja, "front.extra": "x", "fixture.note": " ", "front.edition": "{label}" },
    };
    expect(problems(planted)).toEqual([
      "zh: missing front.name",
      "ja: front.edition has {label}, not {formed,label,sea,waves}",
      "ja: fixture.note is empty",
      "ja: front.extra is not an English key",
    ]);
  });
});

describe("translator", () => {
  test("fills each {name} and leaves a text without one as it is", () => {
    const t = translator("en");
    expect(t("front.flat.text", { next: "09:00" })).toBe(
      "Nothing has been scanned yet. Next scan: 09:00.",
    );
    expect(t("classifieds.name")).toBe("Classifieds");
  });

  test("reads the table of the language asked for", () => {
    const names: Record<Language, string> = { en: "Front page", zh: "头版", ja: "一面" };
    for (const lang of LanguageSchema.options)
      expect(translator(lang)("front.name")).toBe(names[lang]);
  });

  test("a key that needs values cannot be called without them", () => {
    const t = translator("en");
    // @ts-expect-error `front.flat.text` needs `{ next }`.
    expect(t("front.flat.text")).toContain("{next}");
  });
});
