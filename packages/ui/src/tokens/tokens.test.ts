import { describe, expect, test } from "bun:test";
import tokens from "../../../../design/system/tokens.json" with { type: "json" };
import {
  CONTROL,
  colorOf,
  FONT_FILES,
  FOOTER,
  fontFaceCss,
  ICON,
  PHONE,
  size,
  tokensCss,
  typeClassesCss,
  typeStyle,
} from "./index.ts";

// Checked against `tokens.json` itself, not against the generated file.
const [root = "", forcedLight = "", systemDark = "", forcedDark = ""] = tokensCss().split("\n");

// How `uiCss()` holds these, read as rules: `../styles/styles.test.ts`.
describe("design tokens as CSS", () => {
  test("four blocks: the root, light by choice, dark from the system, dark by choice", () => {
    expect(tokensCss().split("\n")).toHaveLength(4);
  });

  test("every colour is one variable for both themes, each shadow one per theme block", () => {
    for (const t of tokens.color.tokens) {
      const both = t.value.light === t.value.dark;
      const value = both ? t.value.light : `light-dark(${t.value.light},${t.value.dark})`;
      expect(root).toContain(`--${t.name}:${value};`);
      for (const block of [forcedLight, systemDark, forcedDark]) {
        expect(block).not.toContain(`--${t.name}:`);
      }
    }
    for (const t of tokens.shadow.tokens) {
      expect(root).toContain(`--${t.name}:${t.value.light};`);
      expect(systemDark).toContain(`--${t.name}:${t.value.dark};`);
      expect(forcedDark).toContain(`--${t.name}:${t.value.dark};`);
    }
  });

  test("the system picks the theme unless the page picks light or dark", () => {
    expect(root).toContain("color-scheme:light dark;");
    expect(forcedLight).toBe(':root[data-theme="light"]{color-scheme:light}');
    expect(systemDark).toStartWith(
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--shadow-',
    );
    expect(forcedDark).toStartWith(':root[data-theme="dark"]{color-scheme:dark;');
  });

  test("the phone values are variables for the components' CSS", () => {
    expect(root).toContain(`--phone-gutter:${PHONE.gutter.value};`);
    expect(root).toContain(`--phone-section-size:${PHONE.sectionSize.value};`);
  });

  test("the control height and the icon sizes are variables for the components' CSS", () => {
    expect(root).toContain(`--control-min-height:${CONTROL.minHeight};`);
    expect(root).toContain(`--control-height:${CONTROL.height};`);
    expect(root).toContain(`--icon-size:${ICON.size};`);
    expect(root).toContain(`--icon-stroke:${ICON.stroke};`);
    expect(root).toContain(`--icon-theme-switch:${ICON.themeSwitch};`);
    expect(root).toContain(`--control-outline:${CONTROL.outline};`);
  });

  test("the footer's values are variables for its CSS", () => {
    expect(root).toContain(`--footer-beam-opacity:${FOOTER.beamOpacity};`);
    expect(root).toContain(`--footer-beam-sweep:${FOOTER.beamSweep};`);
    expect(root).toContain(`--footer-link-weight:${FOOTER.linkWeight};`);
    expect(Object.keys(FOOTER)).toHaveLength(11);
  });

  test("sun is the same in both themes", () => {
    const sun = tokens.color.tokens.find((t) => t.name === "sun");
    expect(sun?.value.light).toBe(sun?.value.dark as string);
  });

  test("spacing, radius, line widths and type are variables", () => {
    for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.rule.tokens]) {
      expect(root).toContain(`--${t.name}:${t.value};`);
    }
    expect(root).toContain(`--font-display:${tokens.type.families.display};`);
    expect(root).toContain(`--font-body:${tokens.type.families.body};`);
    expect(root).toContain("--type-section-style:italic;");
    expect(root).toContain("--type-masthead-tracking:-0.045em;");
  });

  test("one .type class per type style, in the design's order", () => {
    const names = tokens.type.groups.flatMap((g) => g.styles.map((s) => s.name));
    const classes = [...typeClassesCss().matchAll(/^\.type-([\w-]+)\{/gm)].map((m) => m[1]);
    expect(classes).toEqual(names);
    expect(typeClassesCss()).toContain(".type-label{font-family:var(--font-body);");
  });

  test("the smallest type size is 13px", () => {
    const sizes = tokens.type.groups.flatMap((g) =>
      g.styles.map((s) => Number.parseFloat(s.fontSize)),
    );
    expect(Math.min(...sizes)).toBe(13);
  });
});

describe("token values", () => {
  test("colorOf, size and typeStyle return the design's values", () => {
    for (const t of tokens.color.tokens) {
      const name = t.name as Parameters<typeof colorOf>[0];
      expect(colorOf(name, "light")).toBe(t.value.light);
      expect(colorOf(name, "dark")).toBe(t.value.dark);
    }
    for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.rule.tokens]) {
      expect(size(t.name as Parameters<typeof size>[0])).toBe(t.value);
    }
    expect(typeStyle("section")).toEqual({
      family: tokens.type.families.display,
      size: "38px",
      lineHeight: 1.08,
      weight: 400,
      style: "italic",
      tracking: "-0.02em",
    });
    expect(typeStyle("body").style).toBe("normal");
    expect(typeStyle("body").tracking).toBe("normal");
  });

  test("font faces point at the base given, one per file", () => {
    const css = fontFaceCss("/f");
    expect(css.match(/@font-face/g)?.length).toBe(FONT_FILES.length);
    for (const f of FONT_FILES) expect(css).toContain(`src:url(/f/${f.file}) format("woff2")`);
  });
});

describe("supplement: values the design states only in prose", () => {
  test("the phone values are the ones the token usage states", () => {
    const usage = (name: string) =>
      [...tokens.spacing.tokens, ...tokens.type.groups.flatMap((g) => g.styles)].find(
        (t) => t.name === name,
      )?.usage ?? "";
    for (const v of Object.values(PHONE)) expect(usage(v.token)).toContain(v.value);
  });

  test("the control height is the one the Button README states", async () => {
    const readme = await Bun.file(
      `${import.meta.dir}/../../../../design/system/components/Button/README.md`,
    ).text();
    expect(readme).toContain(`高度不小于 ${CONTROL.minHeight}，桌面默认 ${CONTROL.height}`);
    expect(readme).toContain(`默认：${CONTROL.outline} \`ink\` 描边`);
  });

  test("the footer's beam is the one the design system README states", async () => {
    const readme = await Bun.file(`${import.meta.dir}/../../../../design/system/README.md`).text();
    expect(readme).toContain(
      `灯塔光束的 ${Math.round(Number(FOOTER.beamOpacity) * 100)}% 黄色是唯一例外`,
    );
    expect(readme).toContain(`光束 ${Number.parseFloat(FOOTER.beamSweep)} 秒一个来回`);
  });

  test("the footer's other timings, angles and link weight are the ones boards 01 and 02 draw", async () => {
    const f = FOOTER;
    for (const board of ["Front2", "FrontMobile"]) {
      const html = await Bun.file(
        `${import.meta.dir}/../../../../design/boards/${board}.dc.html`,
      ).text();
      const lines = [
        `@keyframes sweep{0%,100%{transform:rotate(${f.beamFrom})}50%{transform:rotate(${f.beamTo})}}`,
        `@keyframes bob{0%,100%{transform:translateY(0) rotate(-${f.boatPitch})}50%{transform:translateY(${f.boatRise}) rotate(${f.boatPitch})}}`,
        `.w1{animation:drift ${f.waveBack} linear infinite}`,
        `.w2{animation:drift ${f.waveMid} linear infinite reverse}`,
        `.w3{animation:drift ${f.waveFront} linear infinite}`,
        `.beam{transform-box:view-box;transform-origin:1132px 92px;animation:sweep ${f.beamSweep} ease-in-out infinite}`,
        `.boat{transform-box:fill-box;transform-origin:center;animation:bob ${f.boatBob} ease-in-out infinite}`,
        `text-decoration:none;font-weight:${f.linkWeight}}`,
      ];
      for (const line of lines)
        expect({ board, line, found: html.includes(line) }).toEqual({ board, line, found: true });
    }
  });

  test("the icon size and stroke are the ones the design system README states", async () => {
    const readme = await Bun.file(`${import.meta.dir}/../../../../design/system/README.md`).text();
    expect(readme).toContain(`线宽约 ${ICON.stroke}，${ICON.size} 画板`);
  });

  test("the theme switch's icon size is the one boards 01 and 02 draw", async () => {
    const px = Number.parseFloat(ICON.themeSwitch);
    for (const board of ["Front2", "FrontMobile"]) {
      const html = await Bun.file(
        `${import.meta.dir}/../../../../design/boards/${board}.dc.html`,
      ).text();
      const button = /<button[^>]*onClick="\{\{ toggleTheme \}\}"[^>]*><svg ([^>]*)>/.exec(html);
      expect({ board, svg: button?.[1] }).toEqual({
        board,
        svg: `width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" aria-hidden="true"`,
      });
    }
  });
});
