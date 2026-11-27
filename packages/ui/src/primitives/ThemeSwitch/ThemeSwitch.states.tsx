/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import ThemeSwitch from "./ThemeSwitch.island.tsx";

export default states(ThemeSwitch, {
  default: { toDark: "Switch to dark mode", toLight: "Switch to light mode" },
});
