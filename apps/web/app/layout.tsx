import type { Metadata } from "next";
import { CSS, HTML_LANG } from "@breaker-delta/publisher";

import { isLang } from "../lib/data";

export const metadata: Metadata = {
  title: "浪尖雷达 Breaker Delta",
  description: "Catch emerging topics before they trend.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params?: Promise<{ lang?: string }>;
}>) {
  const lang = (await params)?.lang;
  return (
    <html lang={isLang(lang ?? "") ? HTML_LANG[lang as string] : "zh-CN"}>
      <head>
        {/* The static build's stylesheet, shared verbatim (P2: one
            source of styles until the design itself is revisited). */}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
