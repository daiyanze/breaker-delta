/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Button } from "./Button.tsx";

// The three variants of the Button README, with its own sample text, and a
// link (`href`), which looks the same. The text sets the width, so a long
// state and a state per language with its own text (ADR 0020, section 12).
export default states(Button, {
  default: { children: "Read all 214 echoes" },
  solid: { variant: "solid", type: "submit", children: "Subscribe" },
  secondary: { variant: "secondary", children: "Copy link" },
  link: { href: "/echoes", children: "Read all 214 echoes" },
  long: {
    href: "/echoes",
    children:
      "Read every one of the 214 echoes this wave was built from, newest first, with their sources",
  },
  zh: { href: "/zh/echoes", children: "查看全部 214 条回声" },
  ja: { href: "/ja/echoes", children: "214 件のエコーをすべて読む" },
});
