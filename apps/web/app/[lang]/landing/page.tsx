import { notFound } from "next/navigation";

import { LANDING } from "@breaker-delta/publisher";

import { DOCS_URL, Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { getSiteData, isLang, rewriteLinks, type Lang } from "../../../lib/data";

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  await getSiteData();
  const prefix = l === "zh" ? "" : `${l}/`;
  const html = rewriteLinks(
    LANDING[l].split("{{DOCS}}").join(`${DOCS_URL}${prefix}`),
    l,
  );
  return (
    <div className="wrap">
      <Mast lang={l} active="" path="landing" />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Footer lang={l} />
    </div>
  );
}
