/**
 * Island props are JSON (ADR 0020, section 2): a type test. `bun run
 * typecheck` compiles it; each `@ts-expect-error` fails the compile when
 * its line stops being an error, and each line without one fails it when it
 * becomes one. It sits in `patterns`, the layer whose islands take the read
 * contracts' shapes as props, since `runtime` may not import
 * `@bd/contracts`. The test body only runs the calls.
 */
import { expect, test } from "bun:test";
import type { Edition, RankRow, SiteMeta } from "@bd/contracts";
import type { ComponentChildren } from "preact";
import { island } from "../runtime/index.ts";

const none = () => null;

test("island props: what compiles and what does not", () => {
  // @ts-expect-error a function is not JSON
  island("Fn", (_: { onPick: () => void }) => null);
  // @ts-expect-error a Date is not JSON
  island("When", (_: { at: Date }) => null);
  // @ts-expect-error a Map is not JSON
  island("Lookup", (_: { byId: Map<string, number> }) => null);
  // @ts-expect-error a callback nested in an array of objects is not JSON
  island("Nested", (_: { rows: readonly { label: string; fmt: () => string }[] }) => null);
  // @ts-expect-error an island is a leaf: children are VNodes, not JSON
  island("Wrap", (_: { children: ComponentChildren }) => null);
  // @ts-expect-error `unknown` is rejected, even when the data is JSON
  island("Loose", (_: { from: unknown }) => null);

  island("Row", (_: { row: RankRow }) => null);
  island("Meta", (_: { meta: SiteMeta }) => null);
  island("Paper", (_: { edition: Edition | null }) => null);
  island("Plain", (_: { label: string; count?: number; tags: string[] }) => null);

  expect(island("Done", none).islandName).toBe("Done");
});
