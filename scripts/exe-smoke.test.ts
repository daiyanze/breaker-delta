import { describe, expect, test } from "bun:test";
import { ENV, judge, parseExpectation } from "./exe-smoke.ts";

describe("exe-smoke arguments", () => {
  test("a path, or a path and text split at the first =", () => {
    expect(parseExpectation("/health")).toEqual({ path: "/health", text: null });
    expect(parseExpectation("/=16 waves up")).toEqual({ path: "/", text: "16 waves up" });
    expect(parseExpectation('/=class="Band')).toEqual({ path: "/", text: 'class="Band' });
  });

  test("an answer passes only with 200 and the text", () => {
    const want = { path: "/", text: "@layer" };
    expect(judge(want, 200, "@layer tokens")).toBeNull();
    expect(judge(want, 404, "@layer")).toBe("answered 404, not 200");
    expect(judge(want, 200, "nothing")).toBe('does not hold "@layer"');
    expect(judge({ path: "/", text: null }, 200, "")).toBeNull();
  });

  test("the executable reads fixtures with the fake model, on free ports (invariant 6)", () => {
    expect(ENV).toMatchObject({
      BD_SOURCES: "fixtures",
      MODEL_DRIVER: "fake",
      READ_SOURCE: "fixtures",
      FIXTURE_SET: "busy",
      BD_PORT: "0",
      BD_WEB_PORT: "0",
      BD_BRIDGE_PORT: "0",
    });
  });
});
