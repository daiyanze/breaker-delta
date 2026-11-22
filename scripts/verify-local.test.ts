import { expect, test } from "bun:test";
import { evidenceName, fixtureSets, parseStartLine, preview } from "./verify-local.ts";

test("reads both URLs from the launcher's start-up line", () => {
  const log =
    "[pipeline] applied migrations: 0000_init\n" +
    "[local] pipeline http://127.0.0.1:41325, site http://127.0.0.1:41326, data in /tmp/x\n";
  expect(parseStartLine(log)).toEqual({
    pipelineUrl: "http://127.0.0.1:41325",
    siteUrl: "http://127.0.0.1:41326",
  });
});

test("an unfinished log has no URLs yet", () => {
  expect(parseStartLine("")).toBeNull();
  expect(parseStartLine("[pipeline] applied migrations: 0000_init\n")).toBeNull();
});

test("evidence files sort in the order they were saved and say what they hold", () => {
  expect(evidenceName(3, "/?set=quiet&lang=ja", "html")).toBe("03-set-quiet-lang-ja.html");
  expect(evidenceName(12, "/", "html")).toBe("12-root.html");
  expect(evidenceName(1, "tick", "json")).toBe("01-tick.json");
});

test("fixture sets are read from the repository", () => {
  expect(fixtureSets()).toEqual(["busy", "fresh", "quiet"]);
});

test("a page is printed from <body>, however long its <head> is", () => {
  const page = `<html><head><style>${"x".repeat(5000)}</style></head><body><p>edition</p></body></html>`;
  expect(preview(page)).toStartWith("<body><p>edition</p>");
  expect(preview('{"ok":true}')).toBe('{"ok":true}');
  expect(preview(page, 10)).toBe("<body><p>e");
});
