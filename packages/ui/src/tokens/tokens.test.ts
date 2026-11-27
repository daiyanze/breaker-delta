import { describe, expect, test } from "bun:test";
import tokens from "../../../../design/system/tokens.json" with { type: "json" };
import {
  CONTROL,
  colorOf,
  ECHO_STACK,
  FONT_FILES,
  fontFaceCss,
  ICON,
  MASTHEAD,
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
  });

  test("the masthead's values are variables for its CSS", () => {
    expect(root).toContain(`--masthead-wordmark-phone:${MASTHEAD.wordmarkPhone};`);
    expect(root).toContain(`--masthead-wave-loop:${MASTHEAD.waveLoop};`);
    expect(root).toContain(`--masthead-sail-desktop:${MASTHEAD.sailDesktop};`);
    expect(Object.keys(MASTHEAD)).toHaveLength(15);
  });

  test("the echo stack's sizes and timing are variables for its CSS", () => {
    expect(root).toContain(`--echo-stack-width:${ECHO_STACK.width};`);
    expect(root).toContain(`--echo-stack-phone-width:${ECHO_STACK.phoneWidth};`);
    expect(root).toContain(`--echo-stack-loop:${ECHO_STACK.loop};`);
    expect(root).toContain(`--echo-stack-step:${ECHO_STACK.step};`);
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

  test("the masthead's values are the ones its README and the masthead type style state", async () => {
    const readme = await Bun.file(
      `${import.meta.dir}/../../../../design/system/components/Masthead/README.md`,
    ).text();
    const m = MASTHEAD;
    expect(readme).toContain(`高度是字标字号的 ${Number.parseFloat(m.markSize)} 倍`);
    expect(readme).toContain(`间距 ${m.markGap}`);
    expect(readme).toContain(`${m.waveStroke} \`ink\` 描边的正弦线，周期 60px`);
    expect(readme).toContain(`${Number.parseFloat(m.waveLoop)} 秒向左流动 ${m.waveDrift}`);
    expect(readme).toContain(
      `每 ${Number.parseFloat(m.boatBeat)} 秒越过一个浪，上下 ±${m.boatRise}、俯仰 ±${Number.parseFloat(m.boatPitch)}°`,
    );
    expect(readme).toContain(`圆章 ${m.markPhone}（最简画法），字标 ${m.wordmarkPhone} 单行`);
    const usage = tokens.type.groups
      .flatMap((g) => g.styles)
      .find((s) => s.name === "masthead")?.usage;
    expect(usage).toContain(
      `桌面 clamp(${m.wordmarkMin}, ${m.wordmarkFluid}, ${typeStyle("masthead").size})，手机 ${m.wordmarkPhone}`,
    );
  });

  test("the wave's height and the boat's crossing times are the ones boards 01 and 02 draw", async () => {
    const board = (name: string) =>
      Bun.file(`${import.meta.dir}/../../../../design/boards/${name}.dc.html`).text();
    const px = Number.parseFloat(MASTHEAD.waveHeight);
    const desktop = await board("Front2");
    const phone = await board("FrontMobile");
    expect(desktop).toContain(`<svg viewBox="0 0 1280 ${px}" preserveAspectRatio="xMidYMid slice"`);
    expect(phone).toContain(`<svg viewBox="0 0 390 ${px}" preserveAspectRatio="xMidYMid slice"`);
    expect(desktop).toContain(`.sail{animation:sail ${MASTHEAD.sailDesktop} linear infinite}`);
    expect(phone).toContain(`.sail{animation-duration:${MASTHEAD.sailPhone}}`);
  });

  test("the echo stack's sizes are the boards', its timing the README's", async () => {
    const dir = `${import.meta.dir}/../../../../design`;
    const svg = (size: string) =>
      `<svg viewBox="0 0 120 220" role="img" aria-label="{{ lead.gaugeAria }}" style="flex: 0 0 auto; ${size}; display: block">`;
    expect(await Bun.file(`${dir}/boards/Front2.dc.html`).text()).toContain(
      svg(`width: ${ECHO_STACK.width}; height: 168px`),
    );
    expect(await Bun.file(`${dir}/boards/FrontMobile.dc.html`).text()).toContain(
      svg(`width: ${ECHO_STACK.phoneWidth}; height: 125px`),
    );
    expect(await Bun.file(`${dir}/boards/Topic2.dc.html`).text()).toContain(
      `viewBox="0 0 120 220" role="img" aria-label="Echoes stacking into a wave, 12 layers high" style="flex: 0 0 auto; width: ${ECHO_STACK.width}; height: 168px`,
    );
    const readme = await Bun.file(`${dir}/system/components/EchoStack/README.md`).text();
    expect(readme).toContain(`每层间隔 ${Number.parseFloat(ECHO_STACK.step)} 秒`);
    expect(readme).toContain(`${Number.parseFloat(ECHO_STACK.loop)} 秒一个循环`);
  });
});
