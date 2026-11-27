/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import ThemeSwitch from "./ThemeSwitch.island.tsx";

export default states(ThemeSwitch, {
  default: { label: "Dark theme" },
  long: { label: "Show every page in the dark theme" },
  zh: { label: "深色主题" },
  ja: { label: "ダークテーマ" },
});
