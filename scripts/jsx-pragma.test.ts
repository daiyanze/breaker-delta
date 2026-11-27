import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PREACT_PRAGMA, pragmaProblems, REACT_PRAGMA } from "./jsx-pragma.ts";

const root = join(import.meta.dir, "..");

test("every .tsx in this repository starts with its JSX pragma", () => {
  expect(pragmaProblems(root)).toEqual([]);
});

// Lesson L7: a violation in every place the check covers.
test("a .tsx whose first line is not its pragma is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "bd-pragma-"));
  const file = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  file("packages/ui/src/patterns/Ok/Ok.tsx", `${PREACT_PRAGMA}\nexport {};\n`);
  file("apps/web/src/core/pages/crlf.tsx", `${PREACT_PRAGMA}\r\nexport {};\r\n`);
  file("packages/mail/src/Ok.tsx", `${REACT_PRAGMA}\nexport {};\n`);
  file("packages/ui/src/patterns/None/None.tsx", "export {};\n");
  file("apps/web/src/core/pages/second.tsx", `// a comment first\n${PREACT_PRAGMA}\n`);
  file("apps/local/late.tsx", `\n${PREACT_PRAGMA}\n`);
  file("scripts/react.tsx", `${REACT_PRAGMA}\n`);
  file("packages/mail/src/Preact.tsx", `${PREACT_PRAGMA}\n`);
  file("packages/ui/src/patterns/Spaced/Spaced.tsx", `/**  @jsxImportSource preact */\n`);
  file("packages/ui/node_modules/x/skipped.tsx", "export {};\n");
  const found = pragmaProblems(dir).map((p) => p.split(":")[0]);
  expect(found.sort()).toEqual(
    [
      "apps/local/late.tsx",
      "apps/web/src/core/pages/second.tsx",
      "packages/mail/src/Preact.tsx",
      "packages/ui/src/patterns/None/None.tsx",
      "packages/ui/src/patterns/Spaced/Spaced.tsx",
      "scripts/react.tsx",
    ].sort(),
  );
});
