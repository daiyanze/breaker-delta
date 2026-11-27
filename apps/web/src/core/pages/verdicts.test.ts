import { describe, expect, test } from "bun:test";
import { stampDate, stubDay } from "./verdicts.tsx";

describe("a stub's day", () => {
  const registered = "2026-11-12T18:00:00+09:00";
  const due = "2026-11-26T18:00:00+09:00";

  test("board 01: registered Nov 12 at 18:00, seen Nov 19 at 14:00, is day 7 of 14", () => {
    expect(stubDay(registered, due, "2026-11-19T14:00:00+09:00")).toEqual({ day: 7, days: 14 });
  });

  test("the first hour is day 1; a full day later, day 2 begins", () => {
    expect(stubDay(registered, due, "2026-11-12T18:00:00+09:00")).toEqual({ day: 1, days: 14 });
    expect(stubDay(registered, due, "2026-11-13T17:59:00+09:00")).toEqual({ day: 1, days: 14 });
    expect(stubDay(registered, due, "2026-11-13T18:01:00+09:00")).toEqual({ day: 2, days: 14 });
  });

  test("never before day 1 or past the last day", () => {
    expect(stubDay(registered, due, "2026-11-01T00:00:00+09:00").day).toBe(1);
    expect(stubDay(registered, due, "2026-12-30T00:00:00+09:00").day).toBe(14);
  });
});

describe("a stamp's date", () => {
  test("short, in the page's language and the site's time zone", () => {
    const at = "2026-11-26T18:00:00+09:00";
    expect(stampDate(at, "en", "Asia/Tokyo")).toBe("Nov 26");
    expect(stampDate(at, "zh", "Asia/Tokyo")).toBe("11月26日");
    expect(stampDate(at, "ja", "Asia/Tokyo")).toBe("11月26日");
    // 00:30 on Nov 26 in Tokyo is still Nov 25 in Los Angeles.
    expect(stampDate("2026-11-26T00:30:00+09:00", "en", "America/Los_Angeles")).toBe("Nov 25");
  });
});
