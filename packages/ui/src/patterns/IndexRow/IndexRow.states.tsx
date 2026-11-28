/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { IndexRow, type IndexRowProps } from "./IndexRow.tsx";

// Sample rows from boards 01 and 02. A row's title sets where its leader
// starts, so long text and each language's own text are states of their own.

const row = (over: Partial<IndexRowProps>): IndexRowProps => ({
  href: "/topic/founder-ceo-ousted",
  rank: 1,
  title: { lang: "en", text: "Founder CEO ousted" },
  height: 196,
  formedToday: false,
  change: "+63%",
  ...over,
});

export default states(IndexRow, {
  default: row({}),
  new: row({
    href: "/topic/ai-lab-sued",
    rank: 2,
    title: { lang: "en", text: "AI lab sued over agents" },
    height: 181,
    formedToday: true,
    change: "new",
  }),
  down: row({
    href: "/topic/frontier-model-backlash",
    rank: 5,
    title: { lang: "en", text: "Frontier model backlash" },
    height: 144,
    change: "−18%",
  }),
  level: row({
    href: "/topic/quantum-error-rate-claim",
    rank: 16,
    title: { lang: "en", text: "Quantum error-rate claim" },
    height: 62,
    change: "",
  }),
  long: row({
    href: "/topic/long",
    rank: 12,
    title: {
      lang: "en",
      text: "A regulator in three countries opens a joint inquiry into browser agent permissions",
    },
    height: 88,
    change: "+120%",
  }),
  zh: row({ title: { lang: "zh", text: "创始人 CEO 被罢免" }, change: "+63%" }),
  ja: row({ title: { lang: "ja", text: "創業者 CEO が解任" }, change: "+63%" }),
});
