"use client";

import { useEffect, useRef } from "react";

/** The submit page's prefill box: when the page is opened with
 * ?title=&url= (the bookmarklet), fill the template in — the static
 * page does this with an inline script; here it is a client effect
 * on the same textarea. */
export function EchoText({ template }: { template: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("title") || "";
    const u = p.get("url") || "";
    if ((t || u) && ref.current) {
      ref.current.value = `标题：${t}\n链接：${u}\n理由：`;
    }
  }, []);
  return (
    <textarea
      ref={ref}
      id="echotext"
      rows={4}
      readOnly
      style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 13 }}
      defaultValue={template}
    />
  );
}
