/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { EchoStack, echoStackLayers } from "./EchoStack.tsx";

const label = (height: number) =>
  `Echoes stacking into a wave, ${echoStackLayers(height)} layers high`;

// The number of sheets is the only thing that changes the drawing, so the
// states are heights: the boards' 196, one mid-way, the fewest and the most.
// The label is read out, not shown, so no language changes the layout.
export default states(EchoStack, {
  default: { height: 196, label: label(196) },
  mid: { height: 100, label: label(100) },
  low: { height: 12, label: label(12) },
  tallest: { height: 420, label: label(420) },
});
