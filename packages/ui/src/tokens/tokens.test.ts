import { describe, expect, test } from "bun:test";
import tokens from "../../../../design/system/tokens.json" with { type: "json" };
import {
  CONTROL,
  colorOf,
  ECHO_STACK,
  FOCUS,
  FONT_FILES,
  FOOTER,
  fontFaceCss,
  HEADLINE,
  ICON,
  INDEX,
  INDEX_PHONE_ROWS,
  MARK,
  PHONE,
  STAMP,
  STUB,
  size,
  tokensCss,
  typeClassesCss,
  typeStyle,
} from "./index.ts";
import { TYPE_STYLES, type TypeStyle } from "./tokens.gen.ts";

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
    expect(root).toContain(`--control-padding:${CONTROL.padding};`);
    expect(root).toContain(`--focus-width:${FOCUS.width};`);
    expect(root).toContain(`--focus-offset:${FOCUS.offset};`);
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

  test("the stamp, stub and mark values are variables for the components' CSS", () => {
    expect(root).toContain(`--stamp-border:${STAMP.border};`);
    expect(root).toContain(`--stamp-tilt:${STAMP.tilt};`);
    expect(root).toContain(`--stamp-due-tilt:${STAMP.dueTilt};`);
    expect(root).toContain(`--stamp-wobble:${STAMP.wobble};`);
    expect(root).toContain(`--stamp-swing:${STAMP.swing};`);
    expect(root).toContain(`--stamp-swing-scale:${STAMP.swingScale};`);
    expect(root).toContain(`--stub-ticks-width:${STUB.ticksWidth};`);
    expect(root).toContain(`--mark-size:${MARK.size};`);
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
    expect(readme).toContain(`默认：${CONTROL.outline} \`ink\` 描边`);
  });

  test("the button's side padding is the one its preview draws", async () => {
    const preview = await Bun.file(
      `${import.meta.dir}/../../../../design/system/components/Button/preview.html`,
    ).text();
    expect(preview).toContain(
      `min-height:${CONTROL.height};padding:0 ${CONTROL.padding};border:${CONTROL.outline} solid var(--ink);`,
    );
  });

  test("the focus ring is the one boards 01 and 02 draw", async () => {
    const ring = `.tp :focus-visible{outline:${FOCUS.width} solid var(--blue);outline-offset:${FOCUS.offset}}`;
    for (const board of ["Front2", "FrontMobile"]) {
      const html = await Bun.file(
        `${import.meta.dir}/../../../../design/boards/${board}.dc.html`,
      ).text();
      expect({ board, ring: html.includes(ring) }).toEqual({ board, ring: true });
    }
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

  test("the stamp's frame, turns and wobble are the ones the READMEs and boards state", async () => {
    const design = `${import.meta.dir}/../../../../design`;
    const stub = await Bun.file(`${design}/system/components/TicketStub/README.md`).text();
    expect(stub).toContain(`印章：${STAMP.border} 框`);
    expect(stub).toContain(`旋转 ${STAMP.tilt.replace("deg", "°")}`);
    expect(stub).toContain(`待到期的章用 \`red\` 框并旋转 ${STAMP.dueTilt.replace("deg", "°")}`);
    const readme = await Bun.file(`${design}/system/README.md`).text();
    expect(readme).toContain(`悬停时印章晃一下 | ${Number.parseFloat(STAMP.wobble)} 秒`);
    for (const board of ["Front2", "Topic2", "Record2"]) {
      const html = await Bun.file(`${design}/boards/${board}.dc.html`).text();
      expect({
        board,
        hover: html.includes(
          `.stub:hover .stamp{transform:rotate(${STAMP.swing}) scale(${STAMP.swingScale})}`,
        ),
      }).toEqual({ board, hover: true });
    }
  });

  test("the large stub's ticks are as wide as board 03 draws them", async () => {
    const html = await Bun.file(
      `${import.meta.dir}/../../../../design/boards/Topic2.dc.html`,
    ).text();
    const px = Number.parseFloat(STUB.ticksWidth);
    expect(html).toContain(
      `viewBox="0 0 ${px} 30" role="img" aria-label="Day 7 of 14" style="width: 100%; max-width: ${STUB.ticksWidth}`,
    );
  });

  test("a verdict mark's size is the one the VerdictMark README states", async () => {
    const readme = await Bun.file(
      `${import.meta.dir}/../../../../design/system/components/VerdictMark/README.md`,
    ).text();
    expect(readme).toContain(
      `直径 ${MARK.size}，间隔 ${size("space-2")}，桌面每行 14 个，手机每行 10 个`,
    );
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

  test("the headline sizes are the Headline README's, and fill the type scale on desktop", async () => {
    const dir = `${import.meta.dir}/../../../../design`;
    const readme = await Bun.file(`${dir}/system/components/Headline/README.md`).text();
    const n = (v: string) => Number.parseFloat(v);
    const h = HEADLINE;
    expect(readme).toContain(
      `| 头条 | 第 1 名 | ${n(h.leadBase)} + 浪高 ÷ 200 × ${n(h.leadSpan)} | ${n(h.leadPhoneBase)} + 浪高 ÷ 200 × ${n(h.leadPhoneSpan)} |`,
    );
    expect(readme).toContain(
      `| 第二层 | 第 2、3 名 | ${n(h.secondBase)} + 浪高 ÷ 200 × ${n(h.secondSpan)} | ${n(h.secondPhoneBase)} + 浪高 ÷ 200 × ${n(h.secondPhoneSpan)} |`,
    );
    expect(readme).toContain(
      `| 第三层 | 第 4 到 6 名 | ${n(h.thirdBase)} + 浪高 ÷ 200 × ${n(h.thirdSpan)} | ${n(h.thirdPhoneBase)} + 浪高 ÷ 200 × ${n(h.thirdPhoneSpan)} |`,
    );
    expect(readme).toContain(`字重 ${h.fadingWeight}`);
    const size = (name: TypeStyle) => n(TYPE_STYLES[name].fontSize);
    expect(n(h.leadBase) + n(h.leadSpan)).toBe(size("headline-lead"));
    expect(n(h.secondBase) + n(h.secondSpan)).toBe(size("headline-2"));
    expect(n(h.thirdBase) + n(h.thirdSpan)).toBe(size("headline-3"));
    const system = await Bun.file(`${dir}/system/README.md`).text();
    expect(system).toContain(`| 头条走势线 | 加载时自己画出来 | ${n(h.trendDraw)} 秒，一次 |`);
  });

  test("the headline sizes the type scale lacks are the boards'", async () => {
    const dir = `${import.meta.dir}/../../../../design/boards`;
    const desk = await Bun.file(`${dir}/Front2.dc.html`).text();
    const phone = await Bun.file(`${dir}/FrontMobile.dc.html`).text();
    const h = HEADLINE;
    expect(desk).toContain(
      `font-size: ${h.secondNumber}; font-weight: 900; line-height: 1; color: {{ h.nfg }}`,
    );
    expect(desk).toContain(
      `font-size: ${h.thirdNumber}; font-weight: 900; line-height: 1; color: {{ h.nfg }}`,
    );
    expect(phone).toContain(
      `font-style: italic; font-size: ${h.leadPhoneKicker}; color: var(--red)">{{ lead.kick }}`,
    );
    expect(phone).toContain(`font-size: ${h.leadPhoneNumber}; font-weight: 900; line-height: 0.76`);
    expect(phone).toContain(
      `flex: 0 0 ${h.phoneNumberColumn}; font-size: ${h.secondPhoneNumber}; font-weight: 900`,
    );
    expect(phone).toContain(
      `flex: 0 0 ${h.phoneNumberColumn}; font-size: ${h.thirdPhoneNumber}; font-weight: 900`,
    );
  });

  test("the headline values are variables for its CSS", () => {
    for (const [name, v] of Object.entries(HEADLINE)) {
      const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(root).toContain(`--headline-${kebab}:${v};`);
    }
  });

  test("the index values are the IndexRow README's and the boards'", async () => {
    const dir = `${import.meta.dir}/../../../../design`;
    const readme = await Bun.file(`${dir}/system/components/IndexRow/README.md`).text();
    expect(readme).toContain(`短标题 ${INDEX.titleWeight} 字重`);
    expect(readme).toContain(`${INDEX.leader} \`hair\` 点线`);
    expect(readme).toContain(`占固定 ${INDEX.numberColumn}`);
    expect(readme).toContain(`手机只显示前 ${INDEX_PHONE_ROWS} 行`);
    const desk = await Bun.file(`${dir}/boards/Front2.dc.html`).text();
    const phone = await Bun.file(`${dir}/boards/FrontMobile.dc.html`).text();
    const number = `flex: 0 0 ${INDEX.numberColumn}; text-align: right; font-size: ${INDEX.numberSize}; font-weight: 900; color: {{ r.fg }}">{{ r.wave }}`;
    expect(desk).toContain(number);
    expect(phone).toContain(number);
    expect(desk).toContain(
      `flex: 0 0 ${INDEX.rankColumn}; font-style: italic; color: var(--ink2)">{{ r.rank }}`,
    );
    expect(phone).toContain(
      `flex: 0 0 ${INDEX.phoneRankColumn}; font-style: italic; color: var(--ink2)">{{ r.rank }}`,
    );
  });

  test("the index values are variables for its CSS", () => {
    for (const [name, v] of Object.entries(INDEX)) {
      const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(root).toContain(`--index-${kebab}:${v};`);
    }
  });
});
