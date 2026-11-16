import { notFound } from "next/navigation";

import { EchoText } from "../../../components/EchoText";
import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { getSiteData, isLang, type Lang } from "../../../lib/data";
import { s } from "../../../lib/strings";

const BASE_URL = process.env.BD_BASE_URL ?? "https://breakerdelta.com/";
const DATA_REPO = process.env.BD_DATA_REPO ?? "daiyanze/breaker-delta-data";

export default async function SubmitPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  await getSiteData();
  const issueBody = encodeURIComponent("标题：\n链接：\n理由：\n");
  const issueUrl =
    `https://github.com/${DATA_REPO}/issues/new` +
    `?template=echo.md&title=${encodeURIComponent("🌀 投波：")}&body=${issueBody}`;
  const submitAbs = `${BASE_URL}${l === "zh" ? "" : `${l}/`}submit`;
  const bookmarklet =
    "javascript:(function(){var t=document.title||'';" +
    `window.open('${submitAbs}?title='+encodeURIComponent(t)` +
    `+'&url='+encodeURIComponent(location.href),'_blank');})();`;
  return (
    <div className="wrap">
      <Mast lang={l} active="submit" path="submit" />
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "sub_title")}</span>
        </div>
        <div className="detail">
          <p>{s(l, "sub_intro")}</p>
          <h3 style={{ margin: "16px 0 6px" }}>{s(l, "sub_good_t")}</h3>
          <div dangerouslySetInnerHTML={{ __html: s(l, "sub_good") }} />
          <h3 style={{ margin: "16px 0 6px" }}>{s(l, "sub_issue_t")}</h3>
          <p>
            <a href={issueUrl} rel="noopener">
              {s(l, "sub_issue_btn")}
            </a>
          </p>
          <p>{s(l, "sub_issue_note")}</p>
          <h3 style={{ margin: "16px 0 6px" }}>{s(l, "sub_bm_t")}</h3>
          <p>
            <a href={bookmarklet}>{s(l, "sub_bm_btn")}</a>
          </p>
          <p>{s(l, "sub_bm_note")}</p>
          <h3 style={{ margin: "16px 0 6px" }}>{s(l, "sub_prefill_t")}</h3>
          <EchoText template={s(l, "sub_form")} />
        </div>
      </section>
      <Footer lang={l} />
    </div>
  );
}
