/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { Document, ISLAND_TAG, island, renderDocument } from "./index.ts";

interface NoteProps {
  text: string;
  tags: readonly string[];
  nested: { count: number; note: string | null };
}

const Note = island("Note", function Note(props: NoteProps) {
  return <p class="Note">{props.text}</p>;
});

/** The decoding an HTML parser does on an attribute value the renderer wrote. */
const decodeAttribute = (value: string) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** The `name` and `props` attributes of every `<bd-island>`, read with Bun's HTML parser. */
async function islands(
  html: string,
): Promise<{ name: string | null; raw: string; read: string }[]> {
  const found: { name: string | null; raw: string; read: string }[] = [];
  await new HTMLRewriter()
    .on(ISLAND_TAG, {
      element(el) {
        const raw = el.getAttribute("props") ?? "";
        found.push({ name: el.getAttribute("name"), raw, read: decodeAttribute(raw) });
      },
    })
    .transform(new Response(html))
    .text();
  return found;
}

describe("island (ADR 0020, section 2)", () => {
  const props: NoteProps = {
    text: `</script><script>alert("x")</script> 'quoted' & "double" <b>`,
    tags: ["a&b", "</bd-island>"],
    nested: { count: 2, note: `"&<>` },
  };
  const html = renderDocument(
    <Document lang="en" title="T">
      <Note {...props} />
    </Document>,
  );

  test("renders <bd-island name props> around the component's HTML", async () => {
    expect(Note.islandName).toBe("Note");
    expect(html).toContain(`<${ISLAND_TAG} name="Note" props="`);
    expect(html).toContain(
      "<p class=\"Note\">&lt;/script>&lt;script>alert(&quot;x&quot;)&lt;/script> 'quoted' &amp; &quot;double&quot; &lt;b></p></bd-island>",
    );
    expect((await islands(html)).map((i) => i.name)).toEqual(["Note"]);
  });

  test("prop text with </script>, quotes and & has no raw < or quote in the attribute, and reads back equal", async () => {
    const [found] = await islands(html);
    if (found === undefined) throw new Error("no island in the page");
    expect(found.raw).not.toContain("<");
    expect(found.raw).not.toContain('"');
    expect(found.raw).toContain("&lt;/script>");
    expect(found.raw).toContain("&amp;");
    expect(found.raw).toContain("&quot;");
    expect(JSON.parse(found.read)).toEqual(props);
    // The only <script> elements are the document's own two.
    expect(html.match(/<script/g)).toHaveLength(2);
  });
});
