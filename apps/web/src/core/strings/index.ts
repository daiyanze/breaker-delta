/**
 * The site's string tables (ADR 0020, section 6): one per language, every
 * key in each (#107). Components take their text as props; pages read it
 * from here with `translator(lang)`.
 */
import type { Language } from "@bd/contracts";
import { en, type StringKey, type Table } from "./en.ts";
import { ja } from "./ja.ts";
import { zh } from "./zh.ts";

export type { StringKey, Table } from "./en.ts";

/** A table for every language the site can be published in, enabled or not. */
export const STRINGS: { readonly [L in Language]: Table } = { en, zh, ja };

/**
 * Each language's own name for itself, in the language menu and the
 * "Also in" links. The same in every table, so not in one.
 */
export const LANGUAGE_NAMES: { readonly [L in Language]: string } = {
  en: "English",
  zh: "中文",
  ja: "日本語",
};

/** The `{name}`s in a string, as a union. */
type Names<S extends string> = S extends `${string}{${infer N}}${infer Rest}`
  ? N | Names<Rest>
  : never;

/** The values a key needs: none, or one per `{name}` in its English text. */
type Values<K extends StringKey> = [Names<(typeof en)[K]>] extends [never]
  ? []
  : [values: { readonly [N in Names<(typeof en)[K]>]: string | number }];

/** Every `{name}` in a string, in order of appearance. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "");
}

export type Translate = <K extends StringKey>(key: K, ...values: Values<K>) => string;

/** The strings of `lang`, with each `{name}` filled in from `values`. */
export function translator(lang: Language): Translate {
  const table = STRINGS[lang];
  return (key, ...[values]) => {
    const text: string = table[key];
    if (values === undefined) return text;
    const filled = values as Readonly<Record<string, string | number>>;
    return text.replace(/\{(\w+)\}/g, (all, name: string) =>
      name in filled ? String(filled[name]) : all,
    );
  };
}
