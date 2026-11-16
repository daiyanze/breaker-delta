import { notFound } from "next/navigation";

import type { PanelPluginDef } from "@breaker-delta/publisher";

import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import { Panel } from "../../../../components/Panel";
import { getSiteData, isLang, type Lang } from "../../../../lib/data";

/** Plugin pages (Plugin-P2): whole pages contributed by code
 *  plugins, drawn from the block data the CLI's page pass stored.
 *  The web app never executes plugin code. */
export default async function PluginPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  let wanted = slug;
  try {
    wanted = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  const pg = data.pluginPages.find((p) => p.slug === wanted);
  if (!pg) notFound();
  const blocks = pg.langs[l]?.blocks ?? pg.langs.zh?.blocks ?? [];
  const def: PanelPluginDef = {
    id: pg.id,
    order: 0,
    requiresData: false,
    head: { title: pg.title },
    blocks,
  };
  return (
    <div className="wrap">
      <Mast lang={l} active={`plugin:${pg.id}`} path={`plugin/${pg.slug}`} />
      <Panel def={def} lang={l} values={{}} data={undefined} />
      <Footer lang={l} />
    </div>
  );
}
