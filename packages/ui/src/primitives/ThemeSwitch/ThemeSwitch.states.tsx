/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import ThemeSwitch from "./ThemeSwitch.island.tsx";

export default states(ThemeSwitch, {
  default: { toDark: "Switch to dark mode", toLight: "Switch to light mode" },
  long: {
    toDark: "Switch every page of the site to the dark theme",
    toLight: "Switch every page of the site to the light theme",
  },
  zh: { toDark: "切换到深色模式", toLight: "切换到浅色模式" },
  ja: { toDark: "ダークモードに切り替える", toLight: "ライトモードに切り替える" },
});
