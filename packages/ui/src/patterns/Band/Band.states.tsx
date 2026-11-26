/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Band } from "./Band.tsx";

export default states(Band, {
  default: { id: "front", name: "Front page", children: <p>What the sea did today.</p> },
  note: {
    id: "tide",
    name: "Tide table",
    note: "What formed.",
    children: <p>Rising, falling, flat.</p>,
  },
});
