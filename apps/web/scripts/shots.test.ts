import { describe, expect, test } from "bun:test";
import { componentOf, type Outcome, report, shotPath } from "./shots.ts";

describe("screenshot names (#258)", () => {
  test("a shot is stored under its component, with its state, theme, language, width and pose", () => {
    const base = {
      component: "Band",
      state: "note",
      theme: "dark",
      lang: "ja",
      width: "phone",
    } as const;
    expect(shotPath({ ...base, pose: "rest" })).toBe("Band/note.dark.ja.phone.png");
    expect(shotPath({ ...base, pose: "hover" })).toBe("Band/note.dark.ja.phone.hover.png");
    expect(componentOf("ThemeSwitch/default.light.en.desktop.focus.png")).toBe("ThemeSwitch");
  });
});

describe("the screenshot report (#258)", () => {
  test("names the components a change touched, and each shot", () => {
    const outcomes: Outcome[] = [
      { path: "Band/default.light.en.desktop.png", kind: "changed", ratio: 0.0231 },
      {
        path: "Band/note.light.en.phone.png",
        kind: "changed",
        ratio: 0,
        sizes: "390x200, was 390x180",
      },
      { path: "ThemeSwitch/default.light.en.desktop.png", kind: "same" },
      { path: "Gull/default.light.en.desktop.png", kind: "new" },
      { path: "Old/default.light.en.desktop.png", kind: "gone" },
    ];
    const text = report(outcomes, "apps/web/screenshots/linux", ".ui-screens");
    expect(text).toContain("2 changed, 1 new, 1 gone, of 4 shots");
    expect(text).toContain("components affected: Band, Gull, Old");
    expect(text).not.toContain("components affected: Band, Gull, Old, ThemeSwitch");
    expect(text).toContain("changed  Band/default.light.en.desktop.png  2.31% of pixels");
    expect(text).toContain("changed  Band/note.light.en.phone.png  390x200, was 390x180");
    expect(text).toContain("bun run ui:baseline");
  });

  test("says so when every shot matches", () => {
    const outcomes: Outcome[] = [{ path: "Band/default.light.en.desktop.png", kind: "same" }];
    expect(report(outcomes, "b", "o")).toBe("ui screenshots: 1 shots match the baselines in b");
  });
});
