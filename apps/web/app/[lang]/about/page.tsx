import { notFound } from "next/navigation";

import { ABOUT } from "@breaker-delta/publisher";

import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { getSiteData, isLang, rewriteLinks, type Lang } from "../../../lib/data";

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  await getSiteData();
  return (
    <div className="wrap">
      <Mast lang={l} active="about" path="about" />
      <div dangerouslySetInnerHTML={{ __html: rewriteLinks(ABOUT[l], l) }} />
      <Footer lang={l} />
    </div>
  );
}
