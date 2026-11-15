#!/usr/bin/env python3
"""triple-sigma: static site generator (v3, 浪尖雷达).

Reads structured editions from ``editions/YYYY-MM-DD-{pilot,morning,evening}.json``
and generates the multi-page wireframe site under ``site/``:

  index （海浪榜， with draggable time slider) / rising （涨潮榜） / seeds （苗头） /
  categories / sources / archive / about / topic-<slug> （话题页 with 海浪图） /
  edition-<date>-<slot> snapshots, in every language in TS_LANGS (default
  zh,en,ja; zh at the root, others in subdirectories), plus feed.xml /
  atom.xml / sitemap.xml / robots.txt / llms.txt per language tree.

Wave height （浪高） v2 (AIHOT-referenced, uncapped):
  heat = base(must 60 / watch 30 / seed 10) + 20 x sources + 8 x links
         + 25 if first seen. No cap.
Board rank = rank by heat among all topics known at that time point
(carried forward when a topic is not updated in an edition).

Stdlib only. Usage:
    python -m radar.publish [--base-url https://example.com/triple-sigma] [--out site]
"""
import email.utils
import glob
import hashlib
import html
import json
import os
import re
import shutil
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("TS_OUT", str(ROOT / "site")))
PER = int(os.environ.get("TS_PAGE_SIZE", "100"))
ARCHIVE_DAYS = int(os.environ.get("TS_ARCHIVE_DAYS", "7"))
SOURCES_PER = int(os.environ.get("TS_SOURCES_PAGE", "20"))
CREATOR = os.environ.get("TS_CREATOR", "1").lower() not in ("0", "false", "no")
BASE_URL = "https://daiyanze.github.io/breaker-delta/"
SLOT = {"pilot": ("试跑", 0), "morning": ("早报", 1), "evening": ("晚报", 2)}
BASE = {"must": 60, "watch": 30, "seed": 10}
LEVELS = {"must": ("🔥", "必看"), "watch": ("👀", "关注"), "seed": ("🌱", "苗头")}

SOURCE_DOMAINS = {
    "Hacker News": "news.ycombinator.com", "Google News": "news.google.com",
    "Google News 多家": "news.google.com", "TechCrunch": "techcrunch.com",
    "Reddit": "reddit.com", "Reddit r/artificial": "reddit.com",
    "Reddit r/LocalLLaMA": "reddit.com", "Reddit r/technology": "reddit.com",
    "GitHub": "github.com", "GitHub Trending": "github.com",
    "Hugging Face": "huggingface.co", "Hugging Face 博客": "huggingface.co",
    "Product Hunt": "producthunt.com", "CNBC": "cnbc.com", "WSJ": "wsj.com",
    "NYT": "nytimes.com", "Reuters": "reuters.com", "The Verge": "theverge.com",
    "BBC": "bbc.com", "WIRED": "wired.com", "X": "x.com",
    "OpenRouter": "openrouter.ai", "VentureBeat": "venturebeat.com",
    "Anthropic": "anthropic.com", "Anthropic 官方": "anthropic.com",
    "DeepMind": "deepmind.google", "CBS": "cbsnews.com",
    "Microsoft Research": "microsoft.com", "LangChain Blog": "langchain.com",
    "Google Blog": "blog.google", "Ollama Blog": "ollama.com",
    "Databricks Blog": "databricks.com", "Cloudflare Blog": "cloudflare.com",
    "GitHub Changelog": "github.blog", "Mozilla Blog": "mozilla.org",
    "SemiAnalysis": "semianalysis.com", "One Useful Thing": "oneusefulthing.org",
    "Platformer": "platformer.news", "YC Blog": "ycombinator.com",
    "LessWrong": "lesswrong.com", "Stack Exchange": "stackexchange.com",
    "Federal Register": "federalregister.gov",
    "llama.cpp Releases": "github.com", "vLLM Releases": "github.com",
    "Claude Code Releases": "github.com",
    "Interconnects": "interconnects.ai", "Ahead of AI": "magazine.sebastianraschka.com",
    "Dwarkesh Podcast": "dwarkesh.com",
    "USA Today": "usatoday.com", "blog.google": "blog.google",
    "Google 官方博客": "blog.google", "Google 官方": "blog.google",
    "Bloomberg": "bloomberg.com", "Bluesky": "bsky.app",
    "Microsoft 365 状态页": "microsoft.com", "OpenAI 官方博客": "openai.com",
    "The Decoder": "the-decoder.com", "Fortune": "fortune.com",
    "The Guardian": "theguardian.com", "Mastodon 趋势": "mastodon.social",
    "Wikipedia 热读榜": "wikipedia.org", "Crypto Briefing": "cryptobriefing.com",
    "Dealroom": "dealroom.co", "SEC S-1/A": "sec.gov", "SEC S-1 修订稿": "sec.gov",
    "webdevs.ro": "webdevs.ro", "edge0.ai": "edge0.ai",
}

CAT_RULES = [
    ("安全", ["漏洞", "攻击", "后门", "泄露", "入侵", "恶意软件"]),
    ("政策与监管", ["监管", "出口管制", "国会", "禁令", "法规", "审查", "制裁", "听证", "法案"]),
    ("开源", ["开源", "开放权重", "GitHub", "llama.cpp", "open source", "Open Source"]),
    ("商业与资本", ["IPO", "融资", "收购", "财报", "股价", "辞职", "董事会", "CEO", "上市", "估值", "裁员"]),
    ("Agent 与应用", ["Agent", "agent", "智能体", "钱包", "Wallet", "Copilot", "助手"]),
    ("AI 模型", ["模型", "Gemini", "GPT", "Claude", "DeepSeek", "LLM", "发布", "推出", "版本"]),
]


def classify(title, body):
    for text in (title or "", body or ""):
        for cat, kws in CAT_RULES:
            if any(k in text for k in kws):
                return cat
    return "行业动态"


FAV_CACHE = ROOT / "radar" / "favicon-cache"
FAV_FILES = {}
OG_IMG = False

# Languages are a build setting: TS_LANGS=zh,en (comma list). The language
# switcher is only rendered when more than two languages are built.
LANGS = [x.strip() for x in os.environ.get("TS_LANGS", "zh,en,ja").split(",") if x.strip()]
CUR = {"lang": "zh"}
HTML_LANG = {"zh": "zh-CN", "en": "en", "ja": "ja"}
LANG_LABEL = {"zh": "中文", "en": "EN", "ja": "日本語"}

STRINGS = {
    "zh": {"site_name": "浪尖雷达 Breaker Delta", "pg_title": "浪尖雷达",
           "tabs": ["🌊 海浪榜", "📈 涨潮榜", "🌱 苗头", "🗂️ 分类", "📡 数据源", "🏆 战绩", "📚 归档", "ℹ️ 关于"],
           "wave": "浪高", "carried": "结转", "new": "NEW 首现", "rank": "排名", "prev": "前",
           "tags_title": "🏷️ 标签", "editions_n": "{n} 期", "copy_link": "复制链接", "copied": "已复制",
           "ly1": "源头层", "ly2": "发酵层", "ly3": "验证层", "cfg_per": "每源 {v} 条",
           "cfg_top": "Top {v}", "cfg_limit": "上限 {v}", "cfg_stars": "日均 ★ ≥ {v}",
           "cfg_acc": "账号 ≥ {v}", "cfg_verify": "仅验证", "cfg_on": "启用", "cfg_off": "已禁用",
           "rising_empty": "本期没有上涨的话题：与上一时间点相比浪高都没有上升（新上榜话题计入涨潮榜）。",
           "cfg_title": "⚙️ 配置（设置文件原文）", "src_topics_title": "贡献的话题",
           "src_topic_meta": "出现 {n} 次 · 最近 {d}", "creator_title": "✍️ 创作参考",
           "ol_short": "短贴大纲", "ol_long": "长文大纲", "tips_title": "写作 tips",
           "cr_src": "框架取自公开写作 skills：tweet-writer（钩子公式 / PAS）、Hormozi 四段、Dan Koe 节奏",
           "cr_hooks": "钩子三选一（钩子决定 80–90%，先写钩子再写正文）",
           "hk_num": "数字型", "hk_gap": "好奇缺口", "hk_signal": "信号型",
           "cr_pas": "正文骨架 · PAS（问题 → 放大 → 事实）",
           "pas_p": "问题", "pas_a": "放大", "pas_s": "事实",
           "cr_hz": "骨架 · Hormozi 四段（观点 → 故事 → 理由 → 软 CTA）",
           "hz1": "一个观点", "hz2": "故事与证据", "hz3": "理由，不是步骤", "hz4": "软 CTA",
           "hz1_hint": "用一句话写下主张；先从「建议动作」里提炼，写不出就是还没想清",
           "hz3_hint": "从技术、商业、使用者三个角度各写一条理由——讲为什么成立，不讲怎么做",
           "hz4_txt": "结尾轻带一句即可：后续会继续追踪它的浪高变化，想跟进的可以收藏这页",
           "traj": "浪高轨迹", "tips_s": "短贴 tips", "tips_l": "长文 tips",
           "ol_hook": "钩子", "ol_fact": "核心事实", "ol_why": "为什么重要",
           "ol_data": "数据", "ol_src": "出处", "ol_title2": "标题", "ol_lead": "导语",
           "ol_timeline": "事件时间线", "ol_detail": "关键细节", "ol_impact": "影响与判断",
           "ol_next": "后续观察", "ol_next_txt": "关注后续扫描里浪高和排名的变化",
           "resonance": "{n} 个来源共振", "wave_rank": "浪高 {h} · 排名 #{r}",
           "heat_help_t": "浪高是怎么计算的？",
           "heat_help": "<b>浪高</b> = 基础分 + 共振 + 证据 + 首现加分，不设上限。基础分按等级：🔥必看 60、👀关注 30、🌱苗头 10；每多一个<b>独立来源</b> +20（同一来源组的多个链接只算一个来源）；每条<b>原文链接</b> +8；话题<b>第一次出现</b> +25。一个话题至少要有 2 个独立来源才算热点，单来源只记为苗头。某一期没有新动态的话题，按上一次的浪高<b>结转</b>进当前榜单，涨跌是和上一个时间点的全榜相比。",
           "slider": "时间滑块", "current": "当前", "hist": "历史快照",
           "count": "共 {n} 条", "board_title": "🌊 海浪榜 · 全部话题",
           "seeds_title": "🌱 苗头", "seeds_r": "单源或早期信号 · 近 3 期",
           "rising_title": "📈 涨潮榜 · 浪高涨幅", "rising_r": "共 {n} 条上涨",
           "cat_r": "{n} 个话题", "archive_title": "📚 往期归档", "archive_r": "共 {n} 期",
           "archive_row": "共 {n} 条 · 头名：", "sources_title": "📡 数据源",
           "sources_r": "共 {n} 个来源 · 按出现次数排序",
           "src_stats": "域名 {dom} · 贡献 {a} 个话题 · 出现 {b} 次 · 覆盖 {c} 期 · 首次 {d} · 最近 {e}",
           "cur_wave": "当前浪高", "board_rank": "海浪榜排名", "share": "分享到",
           "chart": "🌊 海浪图 · 浪高走势",
           "th": ["期次", "浪高", "排名", "等级", "较上次", "当期标题", "数据源", "原文链接"],
           "first": "首现", "action": "建议动作", "orig_links": "原文链接",
           "foot_about": "关于本站", "theme": "切换主题",
           "snap_title": "🌊 海浪榜 · {x} 快照", "page_of": "第 {p}/{n} 页",
           "desc_default": "浪尖雷达 Breaker Delta：海浪榜、涨潮榜与苗头追踪，用浪高量化话题走势，每个话题一张海浪图。",
           "desc_seeds": "最近三期里首次出现、还在发酵的话题苗头。",
           "desc_rising": "浪高涨幅最大的话题，正在涨潮的热点。",
           "desc_sources": "浪尖雷达的全部数据源与各自贡献的话题统计。",
           "desc_about": "浪尖雷达是什么、浪高算法、页面导览与作者信息。",
           "desc_track": "浪尖雷达战绩复盘：每一期必看与关注话题的登记台账与 14 天复核结果。",
           "tr_title": "🏆 战绩 · 复盘台账",
           "tr_intro": "把每一期的 🔥必看 / 👀关注 逐条登记，14 天后按预设标准复核命中与否。本页由仓库里的 track-record.md 在构建时生成，台账只登记已发布期次，不事后改判。",
           "tr_total": "已登记", "tr_reviewed": "已复核", "tr_hit_rate": "命中率",
           "tr_first_review": "首批复核 {d}（到期后回填结果，未到期不提前计算命中率）",
           "tr_criteria_t": "判定标准",
           "tr_criteria": "<ul class=\"tips\"><li><b>命中</b>：复核日时，该话题在追踪源内持续发酵（后续期次再现 / 讨论量级维持或上升），或预设的事件检查点如期发生并获得主流覆盖。</li><li><b>未命中</b>：14 天内无后续声量、无事件进展，或事实被证伪。</li><li><b>话题弧合并</b>：同一话题跨多期出现时，按首次上榜日期计，复核时合并为一个话题弧评分，各期条目保留。</li><li><b>事实核查优先</b>：标注事实核查优先的条目，以官方 / 主流媒体证实或证伪直接定命中 / 未命中。</li></ul>",
           "tr_th": ["级别", "话题", "复核标准", "复核日", "结果"],
           "tr_pending": "待复核",
           "desc_submit": "向浪尖雷达投苗：提交单源、新鲜、有一手链接的早期信号。",
           "sub_title": "🌱 投苗 · 提交一个苗头",
           "sub_intro": "你刷到一个还没热起来、但可能是种子的信号？投给雷达。投来的苗头先进收件清单，下一期扫描时去重、查共振，够格才进苗头榜——不承诺收录。",
           "sub_good_t": "什么算好苗头",
           "sub_good": "<ul class=\"tips\"><li><b>单源</b>：目前只有一处在说，还没有多家跟进——这正是苗头的样子。</li><li><b>新</b>：刚出现不久（仓库、帖子、产品、论文越新越好），不是已经上热搜的旧闻。</li><li><b>有一手链接</b>：给出原始页面（仓库 / 原帖 / 官网 / 论文），不要二手搬运合集。</li><li><b>一句话理由</b>：为什么你觉得它会长大，一句话就够。</li></ul>",
           "sub_issue_t": "方式一 · GitHub Issue 投苗",
           "sub_issue_btn": "去 GitHub 提投苗 Issue →",
           "sub_issue_note": "链接已预填标题与正文模板（标题 / 链接 / 理由），补齐即可提交。没有 GitHub 账号时，用下方书签工具生成同样格式的文本，发给作者代投。",
           "sub_bm_t": "方式二 · 书签小工具（bookmarklet）",
           "sub_bm_btn": "🌱 投苗到浪尖雷达",
           "sub_bm_note": "把这个链接拖到浏览器书签栏；在任意页面点它，就会带着当前页标题 + 链接打开本页，并生成下面这份可复制的投苗文本。",
           "sub_prefill_t": "投苗文本（可复制）",
           "sub_cta": "🌱 发现一个还没热起来的信号？点这里投苗 →"},
    "en": {"site_name": "Breaker Delta", "pg_title": "Breaker Delta",
           "tabs": ["🌊 Wave Board", "📈 Rising", "🌱 Seeds", "🗂️ Categories", "📡 Sources", "🏆 Track Record", "📚 Archive", "ℹ️ About"],
           "wave": "Wave", "carried": "carried", "new": "NEW", "rank": "Rank", "prev": "was",
           "tags_title": "🏷️ Tags", "editions_n": "{n} editions", "copy_link": "Copy link", "copied": "Copied",
           "ly1": "source layer", "ly2": "fermentation layer", "ly3": "verification layer",
           "cfg_per": "{v} per feed", "cfg_top": "Top {v}", "cfg_limit": "limit {v}",
           "cfg_stars": "★/day ≥ {v}", "cfg_acc": "accounts ≥ {v}", "cfg_verify": "verify only",
           "cfg_on": "enabled", "cfg_off": "disabled",
           "rising_empty": "No topics rose versus the previous time point (new entries count as rising).",
           "cfg_title": "⚙️ Config (verbatim from the settings file)",
           "src_topics_title": "Contributed topics",
           "src_topic_meta": "{n} appearances · latest {d}", "creator_title": "✍️ For creators",
           "ol_short": "Short-post outline", "ol_long": "Long-form outline",
           "cr_src": "Frameworks from public writing skills: tweet-writer (hook formulas / PAS), Hormozi's four parts, Dan Koe's rhythm",
           "cr_hooks": "Three hook options (the hook decides 80–90% — write it first)",
           "hk_num": "Specific result", "hk_gap": "Curiosity gap", "hk_signal": "Signal",
           "cr_pas": "Body skeleton · PAS (Problem → Agitate → Facts)",
           "pas_p": "Problem", "pas_a": "Agitate", "pas_s": "Facts",
           "cr_hz": "Skeleton · Hormozi's four parts (Idea → Story → Reasons → Soft CTA)",
           "hz1": "One idea", "hz2": "Story & evidence", "hz3": "Reasons, not steps", "hz4": "Soft CTA",
           "hz1_hint": "State your claim in one sentence — distill it from the suggested action; if you can't, the angle isn't clear yet",
           "hz3_hint": "One reason each from the tech, business and user angles — argue why it is true, not how to do it",
           "hz4_txt": "End lightly: I will keep tracking its wave height — bookmark this page to follow along",
           "traj": "Wave trail", "tips_s": "Short-post tips", "tips_l": "Long-form tips",
           "tips_title": "Writing tips", "ol_hook": "Hook", "ol_fact": "Key facts",
           "ol_why": "Why it matters", "ol_data": "Data", "ol_src": "Sources",
           "ol_title2": "Title", "ol_lead": "Lead", "ol_timeline": "Timeline",
           "ol_detail": "Key details", "ol_impact": "Impact & take",
           "ol_next": "What to watch", "ol_next_txt": "Watch how its wave height and rank move in later scans",
           "resonance": "{n} sources in resonance", "wave_rank": "Wave {h} · rank #{r}",
           "heat_help_t": "How is wave height calculated?",
           "heat_help": "<b>Wave height</b> = base + resonance + evidence + first-appearance bonus, uncapped. Base by level: 🔥 Must-see 60, 👀 Watch 30, 🌱 Seed 10; +20 per <b>independent source</b> (multiple links from one source group count once); +8 per <b>original link</b>; +25 on a topic's <b>first appearance</b>. A topic needs at least 2 independent sources to count as a hotspot; a single source stays a seed. Topics with no new development are <b>carried forward</b> at their last wave height, and deltas compare against the previous time point's full board.",
           "slider": "Time slider", "current": "current", "hist": "snapshot",
           "count": "{n} topics", "board_title": "🌊 Wave Board · All topics",
           "seeds_title": "🌱 Seeds", "seeds_r": "Single-source / early signals · last 3 editions",
           "rising_title": "📈 Rising · Wave gains", "rising_r": "{n} rising",
           "cat_r": "{n} topics", "archive_title": "📚 Archive", "archive_r": "{n} editions",
           "archive_row": "{n} topics · Top: ", "sources_title": "📡 Data sources",
           "sources_r": "{n} sources · by appearances",
           "src_stats": "{dom} · feeds {a} topics · {b} appearances · {c} editions · first {d} · latest {e}",
           "cur_wave": "Current wave", "board_rank": "Board rank", "share": "Share",
           "chart": "🌊 Wave chart",
           "th": ["Edition", "Wave", "Rank", "Level", "Change", "Title", "Sources", "Links"],
           "first": "First seen", "action": "Suggested action", "orig_links": "Original links",
           "foot_about": "About", "theme": "Toggle theme",
           "snap_title": "🌊 {x} snapshot", "page_of": "Page {p}/{n}",
           "desc_default": "Breaker Delta wave board: every topic quantified as a wave height and tracked over time.",
           "desc_seeds": "Topics that first appeared in the last three editions and are still brewing.",
           "desc_rising": "Topics with the biggest wave-height gains.",
           "desc_sources": "All data sources and the topics each one feeds.",
           "desc_about": "What Breaker Delta is, the wave-height formula, page guide and author info.",
           "desc_track": "Breaker Delta track record: every Must-read and Watch pick, registered in advance and reviewed after 14 days.",
           "tr_title": "🏆 Track Record",
           "tr_intro": "Every 🔥 Must-read / 👀 Watch pick is registered as published and reviewed 14 days later against criteria set in advance. This page is generated at build time from track-record.md in the repo; entries are never rewritten after the fact.",
           "tr_total": "Registered", "tr_reviewed": "Reviewed", "tr_hit_rate": "Hit rate",
           "tr_first_review": "First review batch due {d} (results are filled in when due — no hit rate is computed before then)",
           "tr_criteria_t": "Judgement criteria",
           "tr_criteria": "<ul class=\"tips\"><li><b>Hit</b>: at review time the topic is still developing in the tracked sources (reappears in later editions / discussion holds or grows), or its preset event checkpoint happens on schedule with mainstream coverage.</li><li><b>Miss</b>: no follow-up signal within 14 days, no event progress, or the facts are debunked.</li><li><b>Topic arcs merged</b>: a topic appearing across editions is dated from its first appearance and scored as one arc at review time; every edition's entry is kept.</li><li><b>Fact-check first</b>: entries marked fact-check first are decided directly by official / mainstream confirmation or debunking.</li></ul>",
           "tr_th": ["Level", "Topic", "Review criteria", "Review date", "Result"],
           "tr_pending": "Pending",
           "desc_submit": "Submit a seed to Breaker Delta: a single-source, fresh signal with a first-hand link.",
           "sub_title": "🌱 Submit a seed",
           "sub_intro": "Spotted a signal that has not heated up yet but might be a seed? Send it to the radar. Submissions land in an inbox first; the next scan deduplicates and checks for resonance — only qualifying seeds reach the Seeds board, and inclusion is not promised.",
           "sub_good_t": "What makes a good seed",
           "sub_good": "<ul class=\"tips\"><li><b>Single-source</b>: only one place is talking about it so far — that is exactly what a seed looks like.</li><li><b>Fresh</b>: newly appeared (the newer the repo, post, product or paper, the better), not yesterday's headline.</li><li><b>First-hand link</b>: link the original page (repo / original post / official site / paper), not a roundup.</li><li><b>One-line reason</b>: why you think it will grow, in one sentence.</li></ul>",
           "sub_issue_t": "Option 1 · Submit via GitHub Issue",
           "sub_issue_btn": "Open a seed Issue on GitHub →",
           "sub_issue_note": "The link prefills the title and body template (title / link / reason) — just fill it in. Without a GitHub account, use the bookmarklet below to generate the same format and send it to the author.",
           "sub_bm_t": "Option 2 · Bookmarklet",
           "sub_bm_btn": "🌱 Send seed to Breaker Delta",
           "sub_bm_note": "Drag this link to your bookmarks bar. On any page, clicking it opens this page with that page's title + URL and generates the copyable seed text below.",
           "sub_prefill_t": "Seed text (copyable)",
           "sub_cta": "🌱 Spotted a signal that has not heated up yet? Submit a seed →"},
    "ja": {"site_name": "浪尖レーダー Breaker Delta", "pg_title": "浪尖レーダー",
           "tabs": ["🌊 ウェーブボード", "📈 上昇", "🌱 芽生え", "🗂️ カテゴリ", "📡 ソース", "🏆 戦績", "📚 アーカイブ", "ℹ️ 概要"],
           "wave": "波高", "carried": "繰越", "new": "NEW", "rank": "順位", "prev": "前",
           "tags_title": "🏷️ タグ", "editions_n": "{n} 号", "copy_link": "リンクをコピー", "copied": "コピー済み",
           "ly1": "一次ソース", "ly2": "発酵層", "ly3": "検証層", "cfg_per": "各 {v} 件",
           "cfg_top": "Top {v}", "cfg_limit": "上限 {v}", "cfg_stars": "★/日 ≥ {v}",
           "cfg_acc": "アカウント ≥ {v}", "cfg_verify": "検証のみ", "cfg_on": "有効", "cfg_off": "無効",
           "rising_empty": "前期比で上昇したトピックはありません（新規登場は上昇として数えます）。",
           "cfg_title": "⚙️ 設定（設定ファイル原文）", "src_topics_title": "寄与したトピック",
           "src_topic_meta": "{n} 回登場 · 最新 {d}", "creator_title": "✍️ クリエイター向け",
           "ol_short": "短文アウトライン", "ol_long": "長文アウトライン",
           "cr_src": "枠組みは公開ライティング skills から：tweet-writer（フック公式 / PAS）、Hormozi の4部、Dan Koe のリズム",
           "cr_hooks": "フック3案（フックが 80–90% を決める。まずフックから書く）",
           "hk_num": "数字型", "hk_gap": "好奇ギャップ", "hk_signal": "シグナル型",
           "cr_pas": "本文の骨格 · PAS（問題 → 拡大 → 事実）",
           "pas_p": "問題", "pas_a": "拡大", "pas_s": "事実",
           "cr_hz": "骨格 · Hormozi の4部（主張 → 物語 → 理由 → ソフト CTA）",
           "hz1": "一つの主張", "hz2": "物語と証拠", "hz3": "理由であって手順ではない", "hz4": "ソフト CTA",
           "hz1_hint": "主張を一文で書く。まず「おすすめアクション」から抽出を。書けないなら角度が定まっていない",
           "hz3_hint": "技術・ビジネス・利用者の三つの角度から理由を一つずつ——「なぜ成り立つか」を書き、「どうやるか」は書かない",
           "hz4_txt": "締めは軽く：今後も波高の変化を追跡します。フォローしたい方はこのページを保存どうぞ",
           "traj": "波高の軌跡", "tips_s": "短文 tips", "tips_l": "長文 tips",
           "tips_title": "執筆 tips", "ol_hook": "フック", "ol_fact": "要点",
           "ol_why": "なぜ重要か", "ol_data": "データ", "ol_src": "出典",
           "ol_title2": "タイトル", "ol_lead": "リード", "ol_timeline": "タイムライン",
           "ol_detail": "詳細", "ol_impact": "影響と見方", "ol_next": "今後の注目点",
           "ol_next_txt": "後のスキャンで波高と順位がどう動くか注目",
           "resonance": "{n} ソースが共振", "wave_rank": "波高 {h}・順位 #{r}",
           "heat_help_t": "波高はどう計算される？",
           "heat_help": "<b>波高</b> = 基礎点 + 共振 + 証拠 + 初登場ボーナス（上限なし）。基礎点はレベル別：🔥必見 60、👀注目 30、🌱芽生え 10。<b>独立ソース</b>1つにつき +20（同一グループの複数リンクは1つとして計算）、<b>原文リンク</b>1件につき +8、<b>初登場</b>で +25。ホットな話題には独立ソースが2つ以上必要で、単一ソースは芽生え扱い。新しい動きがない話題は前回の波高で<b>繰り越し</b>され、増減は前時点の全ボードとの比較です。",
           "slider": "時間スライダー", "current": "現在", "hist": "スナップショット",
           "count": "{n} 件", "board_title": "🌊 ウェーブボード · 全トピック",
           "seeds_title": "🌱 芽生え", "seeds_r": "単一ソース・初期シグナル · 直近3号",
           "rising_title": "📈 上昇 · 波高の伸び", "rising_r": "{n} 件上昇",
           "cat_r": "{n} 件", "archive_title": "📚 アーカイブ", "archive_r": "全{n}号",
           "archive_row": "{n} 件 · トップ：", "sources_title": "📡 データソース",
           "sources_r": "全{n}ソース · 出現回数順",
           "src_stats": "{dom} · {a} 件に寄与 · {b} 回出現 · {c} 号カバー · 初出 {d} · 最新 {e}",
           "cur_wave": "現在の波高", "board_rank": "ボード順位", "share": "共有",
           "chart": "🌊 波高チャート",
           "th": ["号", "波高", "順位", "レベル", "前回比", "タイトル", "ソース", "リンク"],
           "first": "初登場", "action": "おすすめアクション", "orig_links": "原文リンク",
           "foot_about": "概要", "theme": "テーマ切替",
           "snap_title": "🌊 {x} スナップショット", "page_of": "{p}/{n} ページ",
           "desc_default": "浪尖レーダー：全トピックを波高で定量化し、推移を追跡するウェーブボード。",
           "desc_seeds": "直近3号で初登場し、まだ発酵中のトピック。",
           "desc_rising": "波高の伸びが最大のトピック。",
           "desc_sources": "全データソースと各ソースが寄与したトピック。",
           "desc_about": "浪尖レーダーについて、波高の計算式、ページ案内と作者情報。",
           "desc_track": "浪尖レーダーの戦績：必読・注目の各トピックを事前登録し、14日後に復核した台帳。",
           "tr_title": "🏆 戦績 · 復核台帳",
           "tr_intro": "各号の 🔥必読 / 👀注目 を1件ずつ登録し、14日後に事前に決めた基準で命中かどうかを復核します。このページはリポジトリの track-record.md からビルド時に生成され、登録後に書き換えることはありません。",
           "tr_total": "登録済み", "tr_reviewed": "復核済み", "tr_hit_rate": "命中率",
           "tr_first_review": "初回復核は {d}（期限が来てから結果を記入します。それまで命中率は計算しません）",
           "tr_criteria_t": "判定基準",
           "tr_criteria": "<ul class=\"tips\"><li><b>命中</b>：復核時点でトピックが追跡ソース内で発酵し続けている（後の号に再登場 / 議論量が維持または上昇）、または事前に設定したイベントのチェックポイントが予定通り起きて主流メディアに報じられた場合。</li><li><b>未命中</b>：14日以内に続報がなく、イベントの進展もない、または事実が否定された場合。</li><li><b>話題アーク統合</b>：複数号に登場するトピックは初登場日を起点とし、復核時は一つのアークとして採点します。各号の記録は残します。</li><li><b>事実確認を優先</b>：事実確認優先と記した項目は、公式 / 主流メディアの確認または否定で直接判定します。</li></ul>",
           "tr_th": ["レベル", "トピック", "復核基準", "復核日", "結果"],
           "tr_pending": "復核待ち",
           "desc_submit": "浪尖レーダーへ芽生えを投稿：単一ソースで新鮮な、一次リンク付きの初期シグナル。",
           "sub_title": "🌱 芽生えを投稿",
           "sub_intro": "まだ熱くなっていないけれど種になりそうなシグナルを見つけたら、レーダーに送ってください。投稿はまず受信箱に入り、次のスキャンで重複排除と共振チェックを行います。芽生えボードに載るのは基準を満たしたものだけで、掲載は保証しません。",
           "sub_good_t": "良い芽生えとは",
           "sub_good": "<ul class=\"tips\"><li><b>単一ソース</b>：今のところ1か所だけが取り上げている——それが芽生えの姿です。</li><li><b>新しい</b>：登場したばかり（リポジトリ・投稿・製品・論文は新しいほど良い）。すでに話題の旧聞ではありません。</li><li><b>一次リンク</b>：元のページ（リポジトリ / 元投稿 / 公式サイト / 論文）へのリンクを。まとめ記事は不可。</li><li><b>一文の理由</b>：なぜ育つと思うか、一文で十分です。</li></ul>",
           "sub_issue_t": "方法1 · GitHub Issue で投稿",
           "sub_issue_btn": "GitHub で投稿 Issue を開く →",
           "sub_issue_note": "リンクにはタイトルと本文テンプレート（タイトル / リンク / 理由）が入力済みです。GitHub アカウントがない場合は、下のブックマークレットで同じ形式のテキストを作って作者に送ってください。",
           "sub_bm_t": "方法2 · ブックマークレット",
           "sub_bm_btn": "🌱 浪尖レーダーに送る",
           "sub_bm_note": "このリンクをブックマークバーにドラッグしてください。任意のページでクリックすると、そのページのタイトル + URL を持ってこのページが開き、下のコピー用テキストが生成されます。",
           "sub_prefill_t": "投稿テキスト（コピー可）",
           "sub_cta": "🌱 まだ熱くなっていないシグナルを見つけたら、ここから投稿 →"},
}
ABOUT = {
    "zh": """<section class="panel"><div class="panel-h"><span>关于浪尖雷达</span></div>
<div class="detail">
<p>浪尖雷达（Breaker Delta）是一个热点追踪站：多源扫描科技与 AI 话题，用自有算法把每个话题量化成一个「浪高」，并持续追踪它的涨落。做这个站的目的很具体——让内容创作者能快速拿到可编辑、可发布的新闻素材：每个话题都有独立页面，给出正文、建议动作、数据源和原文链接。</p>
<p>发布频度不固定：可以是日报、早晚报，也可以是小时报，期次只是标签，每一期的结构都一样。</p>
<h3 style="margin:16px 0 6px">浪高怎么算</h3>
<p>浪高 v2（参考 AIHOT 的量级，不设上限）：等级基分（必看 60 / 关注 30 / 苗头 10）+ 共振 20×来源数 + 证据 8×链接数 + 首现 25。一个话题至少要有 2 个独立来源互相印证才算热点，单源的先记为苗头。</p>
<p>排名是某个时间点上全部已知话题按浪高排序的结果（每页 100 个，超出分页）；升降对比的是上一个时间点。本期没有更新的话题，按最近一次的浪高结转并标注「结转」，不会假装是新数据。</p>
<h3 style="margin:16px 0 6px">页面导览</h3>
<p><a href="index.html">海浪榜</a>：全部话题按浪高排名，带时间滑块回看任意时间点。<a href="rising.html">涨潮榜</a>：浪高涨幅最大的话题。<a href="seeds.html">苗头</a>：最近首次出现、还在发酵的话题。<a href="submit.html">投苗</a>：把你发现的单源新信号投进来。<a href="track-record.html">战绩</a>：每期必看与关注的登记台账和复核结果。<a href="categories.html">分类</a>：按安全 / 政策与监管 / 开源 / 商业与资本 / Agent 与应用 / AI 模型 / 行业动态浏览。<a href="sources.html">数据源</a>：每个来源贡献了哪些话题。<a href="archive.html">往期归档</a>：每一期的完整榜单快照。每个话题页有一张「海浪图」，画的是它的浪高走势，图上的点可以点进对应那一期。</p>
<h3 style="margin:16px 0 6px">技术说明</h3>
<p>每一期的内容以 Markdown 保存在 GitHub 仓库里，可以直接阅读；站点由 Python 在构建时生成静态 HTML。话题页的原文链接带 nofollow。列表里的来源图标是各站的 favicon，构建时抓取并缓存在本地，每次构建用条件请求校验，站点换了图标缓存会自动更新。海浪榜首页有一段小脚本驱动时间滑块（无第三方库），其余页面没有可执行脚本；禁用 JS 时首页显示最新一期，时间轴链接照常打开每期快照。界面语言在构建设置里选择（TS_LANGS），构建出两种以上语言时页面上才显示语言切换。</p>
<h3 style="margin:16px 0 6px">作者与订阅</h3>
<p>作者 Dai：<a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub 仓库</a> · <a href="https://x.com/daiyanze" rel="noopener">X @daiyanze</a> · <a href="feed.xml">RSS</a> · <a href="atom.xml">Atom</a></p>
<p class="note">© 2026 Dai</p>
</div></section>""",
    "en": """<section class="panel"><div class="panel-h"><span>About Breaker Delta</span></div>
<div class="detail">
<p>Breaker Delta （浪尖雷达） tracks tech and AI topics from many sources and quantifies each topic as a "wave height" that rises and falls over time. Its purpose is practical: give content creators ready-to-edit, ready-to-publish news material. Every topic has its own page with the story, a suggested action, its data sources and original links.</p>
<p>Publishing frequency is not fixed: daily, twice a day, or hourly — an edition is just a label, and every edition has the same structure.</p>
<h3 style="margin:16px 0 6px">How the wave height works</h3>
<p>Wave v2 (scale referenced from AIHOT, uncapped): level base (Must-read 60 / Watch 30 / Seed 10) + resonance 20×sources + evidence 8×links + 25 when first seen. A topic needs at least two independent sources to count as a hotspot; single-source signals start as seeds.</p>
<p>Ranks compare all known topics at one point in time (100 per page); deltas compare with the previous point in time. Topics not updated in an edition are carried forward at their last wave height and marked "carried" — never dressed up as fresh data.</p>
<h3 style="margin:16px 0 6px">Pages</h3>
<p><a href="index.html">Wave Board</a>: all topics ranked by wave height, with a time slider. <a href="rising.html">Rising</a>: biggest wave gains. <a href="seeds.html">Seeds</a>: newly appeared topics. <a href="submit.html">Submit a seed</a>: send in a single-source signal you spotted. <a href="track-record.html">Track Record</a>: the registered ledger of picks and their review results. <a href="categories.html">Categories</a>. <a href="sources.html">Sources</a>: what each source feeds. <a href="archive.html">Archive</a>: full snapshot of every edition. Each topic page carries a wave chart of its history.</p>
<h3 style="margin:16px 0 6px">Tech notes</h3>
<p>Editions are kept as Markdown in the GitHub repo and built into static HTML by Python. Original links on topic pages are nofollow. Source icons are each site's favicon, fetched and cached at build time with conditional revalidation. The board's time slider is one small script (no libraries); other pages run no scripts. Interface languages are a build setting (TS_LANGS); the language switcher appears only when more than two languages are built.</p>
<h3 style="margin:16px 0 6px">Author & feeds</h3>
<p>By Dai: <a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub</a> · <a href="https://x.com/daiyanze" rel="noopener">X @daiyanze</a> · <a href="feed.xml">RSS</a> · <a href="atom.xml">Atom</a></p>
<p class="note">© 2026 Dai</p>
</div></section>""",
    "ja": """<section class="panel"><div class="panel-h"><span>浪尖レーダーについて</span></div>
<div class="detail">
<p>浪尖レーダー（Breaker Delta）は、テクノロジーと AI のトピックを複数ソースから追跡し、各トピックを「波高」として定量化して推移を追うサイトです。目的は具体的で、コンテンツ制作者が編集・公開しやすいニュース素材を素早く手に入れられること。各トピックには専用ページがあり、本文、おすすめアクション、データソース、原文リンクを掲載しています。</p>
<p>発行頻度は固定ではありません。日刊、朝夕刊、時間刊でも、号はラベルにすぎず構造は同じです。</p>
<h3 style="margin:16px 0 6px">波高の計算</h3>
<p>波高 v2（AIHOT のスケールを参考、上限なし）：レベル基礎点（必読 60 / 注目 30 / 芽生え 10）+ 共鳴 20×ソース数 + 根拠 8×リンク数 + 初出 25。ホットなトピックには独立したソースが最低2つ必要で、単一ソースはまず「芽生え」として記録します。</p>
<p>順位はある時点の全トピックを波高で並べたもの（1ページ100件）。前回比は直前の時点との比較です。その号で更新されなかったトピックは前回の波高を「繰越」として明示し、新しいデータのふりはしません。</p>
<h3 style="margin:16px 0 6px">ページ案内</h3>
<p><a href="index.html">ウェーブボード</a>：全トピックを波高順に、時間スライダー付き。<a href="rising.html">上昇</a>：波高の伸びが最大。<a href="seeds.html">芽生え</a>：初登場のトピック。<a href="submit.html">芽生え投稿</a>：見つけた単一ソースのシグナルを送れます。<a href="track-record.html">戦績</a>：登録台帳と復核結果。<a href="categories.html">カテゴリ</a>。<a href="sources.html">ソース</a>：各ソースの寄与。<a href="archive.html">アーカイブ</a>：各号の完全なスナップショット。各トピックページには波高チャートがあります。</p>
<h3 style="margin:16px 0 6px">技術メモ</h3>
<p>各号の内容は Markdown として GitHub リポジトリに保存され、Python が静的 HTML にビルドします。原文リンクは nofollow。ソースのアイコンは各サイトの favicon で、ビルド時に取得してローカルにキャッシュし、条件付きリクエストで検証します。時間スライダーは小さなスクリプト1つ（ライブラリなし）で、その他のページにスクリプトはありません。表示言語はビルド設定（TS_LANGS）で選び、3言語以上ビルドしたときだけ言語切替が表示されます。</p>
<h3 style="margin:16px 0 6px">作者とフィード</h3>
<p>作者 Dai：<a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub</a> · <a href="https://x.com/daiyanze" rel="noopener">X @daiyanze</a> · <a href="feed.xml">RSS</a> · <a href="atom.xml">Atom</a></p>
<p class="note">© 2026 Dai</p>
</div></section>""",
}

LEVEL_I18N = {"must": {"zh": "必看", "en": "Must-read", "ja": "必読"},
              "watch": {"zh": "关注", "en": "Watch", "ja": "注目"},
              "seed": {"zh": "苗头", "en": "Seed", "ja": "芽生え"}}
CAT_I18N = {"安全": {"en": "Security", "ja": "セキュリティ"},
            "政策与监管": {"en": "Policy", "ja": "政策・規制"},
            "开源": {"en": "Open Source", "ja": "オープンソース"},
            "商业与资本": {"en": "Business", "ja": "ビジネス"},
            "Agent 与应用": {"en": "Agents & Apps", "ja": "エージェント"},
            "AI 模型": {"en": "AI Models", "ja": "AIモデル"},
            "行业动态": {"en": "Industry", "ja": "業界動向"}}


def s(key):
    return STRINGS[CUR["lang"]][key]


def cat_name(cat):
    if CUR["lang"] == "zh":
        return cat
    return CAT_I18N.get(cat, {}).get(CUR["lang"], cat)


def level_label(level):
    return LEVEL_I18N.get(level, LEVEL_I18N["seed"])[CUR["lang"]]


def lang_prefix():
    return "" if CUR["lang"] == "zh" else CUR["lang"] + "/"


def spark_svg(points):
    if not points:
        return ""
    if len(points) == 1:
        return (f'<svg class="spark-svg" viewBox="0 0 64 26" width="64" height="26">'
                f'<circle cx="60" cy="13" r="2.6" fill="currentColor"/></svg>')
    W, H, P = 64, 26, 3
    lo, hi = min(points), max(points)
    rng = (hi - lo) or 1
    pts = [(P + i * (W - 2 * P) / (len(points) - 1),
            H - P - (v - lo) / rng * (H - 2 * P)) for i, v in enumerate(points)]
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    area = (f"M{pts[0][0]:.1f},{H} " + " ".join(f"L{x:.1f},{y:.1f}" for x, y in pts)
            + f" L{pts[-1][0]:.1f},{H} Z")
    return (f'<svg class="spark-svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<path d="{area}" fill="currentColor" opacity=".16"/>'
            f'<polyline points="{line}" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linejoin="round" stroke-linecap="round"/>'
            f'<circle cx="{pts[-1][0]:.1f}" cy="{pts[-1][1]:.1f}" r="2.6" fill="currentColor"/></svg>')


def trend_points(topic, app):
    """Wave points for the mini chart: appearances within 24h before the
    row's appearance; falls back to the recent appearances when sparse."""
    apps = [a for a in topic["apps"] if a["edition"] <= app["edition"]]
    try:
        t1 = datetime.fromisoformat(app.get("published") or "")
        win = [a for a in apps
               if a.get("published") and (t1 - datetime.fromisoformat(a["published"])).total_seconds() <= 86400]
        if len(win) >= 2:
            return [a["heat"] for a in win]
    except Exception:
        pass
    return [a["heat"] for a in apps[-6:]]


def _img_ok(data, ctype):
    return (ctype.startswith("image") or data[:4] == b"\x00\x00\x01\x00"
            or data[:4] == b"\x89PNG" or data[:4] == b"GIF8" or b"<svg" in data[:200])


def _fetch_one(domain, meta):
    entry = meta.get(domain) or {}
    cached_file = FAV_CACHE / entry["file"] if entry.get("file") else None
    headers = {"User-Agent": "Mozilla/5.0 (triple-sigma build)"}
    if cached_file and cached_file.exists():
        if entry.get("etag"):
            headers["If-None-Match"] = entry["etag"]
        if entry.get("last_modified"):
            headers["If-Modified-Since"] = entry["last_modified"]
    url = f"https://{domain}/favicon.ico"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=6) as r:
            data, ctype = r.read(), r.headers.get_content_type() or ""
            etag, lm = r.headers.get("ETag"), r.headers.get("Last-Modified")
        if not _img_ok(data, ctype):
            raise ValueError("not an image")
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached_file and cached_file.exists():
            return domain, entry, "hit"
        data = None
    except Exception:
        data = None
    if data is None:  # fallback: Google favicon service, hash-compared
        try:
            req = urllib.request.Request(
                f"https://www.google.com/s2/favicons?domain={domain}&sz=64",
                headers={"User-Agent": "Mozilla/5.0 (triple-sigma build)"})
            with urllib.request.urlopen(req, timeout=6) as r:
                data, ctype = r.read(), "image/png"
            etag = lm = None
        except Exception:
            if cached_file and cached_file.exists():
                return domain, entry, "hit-offline"
            return domain, None, "miss"
    sha = hashlib.sha256(data).hexdigest()
    if entry.get("sha256") == sha and cached_file and cached_file.exists():
        return domain, entry, "hit"
    ext = ".png" if "png" in ctype else ".svg" if "svg" in ctype else ".ico"
    fname = domain + ext
    (FAV_CACHE / fname).write_bytes(data)
    return domain, {"file": fname, "sha256": sha, "etag": etag, "last_modified": lm}, "updated"


def fetch_favicons(domains):
    FAV_CACHE.mkdir(parents=True, exist_ok=True)
    meta_path = FAV_CACHE / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    stats = {"hit": 0, "updated": 0, "miss": 0}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for domain, entry, how in ex.map(lambda d: _fetch_one(d, meta), domains):
            stats[how.split("-")[0]] = stats.get(how.split("-")[0], 0) + 1
            if entry:
                meta[domain] = entry
                FAV_FILES[domain] = entry["file"]
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("favicons:", stats)
    return FAV_FILES

CSS = """
:root{--bg:#0a0e13;--panel:#0d1319;--line:#26303d;--ink:#e8eef5;--sub:#93a5bb;--faint:#5f7189;
 --teal:#5eead4;--green:#4ade80;--red:#fb7185;--amber:#f5b83d;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;
 font-family:"Avenir Next","Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1060px;margin:0 auto;padding:26px 18px 50px}
a{color:var(--teal);text-decoration:none} a:hover{text-decoration:underline}
header.mast{display:flex;align-items:center;gap:12px;border:1px solid var(--line);
 background:var(--panel);padding:12px 16px;border-radius:8px}
header.mast svg{width:30px;height:30px}header.mast img.mastmark{width:30px;height:30px}
.wordmark{font-size:13px;letter-spacing:.32em;font-weight:700}
.pg-title{font-size:21px;font-weight:800}
nav.tabs{display:flex;gap:8px;margin:14px 0 0}
nav.tabs a{border:1px solid var(--line);border-radius:6px;padding:5px 14px;color:var(--sub);font-size:13.5px}
nav.tabs a.on{color:var(--ink);border-color:var(--teal);background:rgba(94,234,212,.07)}
.timeline{display:flex;align-items:flex-start;margin:30px 2px 14px;position:relative}
.timeline::before{content:"";position:absolute;left:0;right:0;top:5px;border-top:1px solid var(--line)}
.tick{flex:1;text-align:center;position:relative}
.tick a{color:var(--faint);font-size:12px;display:block;padding-top:20px}
.tick::before{content:"";position:absolute;top:0;left:50%;margin-left:-5px;width:9px;height:9px;
 border-radius:50%;border:1px solid var(--faint);background:var(--bg)}
.tick.on a{color:var(--beam,#f5d97e);font-weight:700}
.tick.on::before{background:#f5d97e;border-color:#f5d97e}
.tl-label{color:var(--faint);font-size:12px;margin-top:14px}
.panel{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 16px 14px;margin-top:18px}
.panel-h{display:flex;justify-content:space-between;padding:10px 0 6px;font-weight:700;font-size:15px}
.panel-h .r{color:var(--faint);font-weight:400;font-size:12.5px}
.row{display:flex;align-items:center;gap:13px;padding:11px 0;border-top:1px solid rgba(255,255,255,.05)}
.row:first-of-type{border-top:none}
.rank{font-size:17px;font-weight:800;width:24px;text-align:center;color:#7d8ea6;font-family:var(--mono)}
.rank.top{color:var(--amber)}
.rtitle{flex:1;min-width:0;font-size:15px;font-weight:600}
.rtitle a{color:var(--ink)} .rtitle a:hover{color:var(--teal);text-decoration:none}
.avatars{display:flex;align-items:center;flex:none}
.av{width:24px;height:24px;border-radius:50%;margin-left:-7px;border:2px solid var(--panel);
 display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#0b1017}
.av:first-child{margin-left:0}
.avimg{width:24px;height:24px;border-radius:50%;margin-left:-7px;border:2px solid var(--panel);
 background:#fff;object-fit:cover;flex:none}
.src-ic{width:30px;height:30px;margin-left:0}
.spark{flex:none;color:#38bdf8;display:flex;align-items:center}
.prank{display:inline;font-size:10.5px;color:var(--faint);font-weight:400;font-family:var(--mono)}
.rank{display:flex;align-items:baseline;gap:6px;width:auto;min-width:70px;text-align:left}
.hdelta{font-size:11.5px;font-family:var(--mono);color:var(--faint)}
.hdelta.up{color:var(--green)} .hdelta.down{color:var(--red)} .hdelta.new{color:var(--amber)}
.heat{display:flex;align-items:center;gap:10px}
.heat .hv{text-align:right}
.mast-ctl{display:flex;gap:8px;margin-left:auto;align-items:center}
.theme-btn{border:1px solid var(--line);background:none;color:var(--sub);border-radius:6px;
 padding:4px 10px;cursor:pointer;font-size:13px}
.theme-btn:hover{color:var(--teal);border-color:var(--teal)}
.langs{display:flex;gap:6px}
.langs a{border:1px solid var(--line);border-radius:6px;padding:4px 9px;font-size:12px;color:var(--sub)}
.langs a.on{color:var(--ink);border-color:var(--teal)}
.ticks-scroll{overflow-x:auto;scrollbar-width:thin;padding-bottom:10px}
.timeline.tight{flex-wrap:nowrap}
.timeline.tight .tick{flex:none;min-width:118px}
.tick.dim a{visibility:hidden}
.srctops{font-size:12px;color:var(--sub)}
[data-theme="light"]{--bg:#f4f1ea;--panel:#fffdf7;--line:#d8d1bd;--ink:#1b2430;--sub:#5d6b7a;
 --faint:#8b96a5;--teal:#0d9488}
[data-theme="light"] .row{border-top-color:rgba(0,0,0,.07)}
[data-theme="light"] th,[data-theme="light"] td{border-top-color:rgba(0,0,0,.08)}
[data-theme="light"] .detail{color:#3d4756}
[data-theme="light"] .spark{color:#0284c7}
[data-theme="light"] .badge{background:rgba(0,0,0,.04)}
[data-theme="light"] details{border-top-color:rgba(0,0,0,.14)}
.avimg:first-child{margin-left:0}
.time{flex:none;color:var(--faint);font-size:12px;font-family:var(--mono)}
.tag{flex:none;font-size:11px;color:var(--teal);border:1px solid rgba(94,234,212,.35);
 border-radius:4px;padding:0 6px}
.more-n{margin-left:6px;font-size:11.5px;color:var(--sub);border:1px solid var(--line);border-radius:999px;padding:1px 7px}
.heat{flex:none;text-align:right;font-family:var(--mono)}
.heat b{font-size:16.5px}
.heat span{color:var(--faint);font-size:11.5px}
.deltas{flex:none;display:flex;flex-direction:column;gap:2px;min-width:86px}
.dchip{font-size:11.5px;font-family:var(--mono);border:1px solid var(--line);border-radius:4px;padding:0 6px;color:var(--sub)}
.dchip.up{color:var(--green);border-color:rgba(74,222,128,.4)}
.dchip.down{color:var(--red);border-color:rgba(251,113,133,.4)}
.dchip.new{color:var(--amber);border-color:rgba(245,184,61,.45)}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px;line-height:1.55}
th,td{border-top:1px solid rgba(255,255,255,.06);padding:11px 12px;text-align:left;vertical-align:top}
th{color:var(--faint);font-weight:600;font-size:12px}
td.n,th.n{font-family:var(--mono)}
.badge{display:inline-block;font-size:11.5px;font-weight:700;padding:1.5px 9px;border:1px solid var(--line);
 border-radius:999px;background:rgba(255,255,255,.04)}
.big-heat{font-family:var(--mono);font-size:52px;font-weight:800;line-height:1}
.detail{color:#c3cedd;font-size:14.5px}
.detail p{margin:7px 0}
details{margin-top:10px;border-top:1px dashed rgba(255,255,255,.12);padding-top:9px}
summary{cursor:pointer;color:var(--teal);font-size:13px;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
details ul{margin:7px 0 2px;padding-left:18px}
details li{font-size:12.5px;margin:3px 0;word-break:break-all}
details a{color:var(--sub)}
.pager{display:flex;gap:8px;justify-content:center;margin-top:16px}
.pager a,.pager span{border:1px solid var(--line);border-radius:6px;padding:4px 13px;font-size:13px;color:var(--sub)}
.pager span.on{color:var(--ink);border-color:var(--teal)}
footer{margin-top:26px;color:var(--faint);font-size:12.5px;border-top:1px solid var(--line);padding-top:13px}
@media (max-width: 720px){
  .wrap{padding:0 10px 40px}
  .mast{flex-wrap:wrap;gap:8px}
  .brand{font-size:19px}
  .tabs{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;scrollbar-width:none;padding-bottom:6px}
  .tabs::-webkit-scrollbar{display:none}
  .tabs a{flex:none}
  .panel{padding:12px}
  h1.pg-title{font-size:19px}
  .row{flex-wrap:wrap;gap:5px 8px;padding:10px 0;align-items:flex-start}
  .rank{order:1;min-width:0;font-size:15px;gap:4px}
  .rtitle{order:2;flex:1 1 52%;font-size:14.5px}
  .heat{order:3;margin-left:auto}
  .hv b{font-size:18px}
  .tag{order:6} .time{order:7} .avas{order:8} .row .note{order:9}
  .slider-row{gap:8px}
  .stats{flex-wrap:wrap;gap:12px 18px}
  .big{font-size:30px}
  table{display:block;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}
  .about-body{font-size:14px}
}
.copy{margin-top:10px}
.copy a{color:var(--sub)}
.share{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}
.sh{border:1px solid var(--line);border-radius:6px;padding:4px 11px;font-size:12.5px;
 color:var(--sub);background:none;cursor:pointer;font-family:inherit;text-decoration:none}
.sh:hover{color:var(--teal);border-color:var(--teal)}
.sh{display:inline-flex;align-items:center;gap:5px}
.sh svg{flex:none}
a.tag{text-decoration:none}
a.badge{text-decoration:none;color:inherit}
.tagchips{display:flex;flex-wrap:wrap;gap:8px}
.tagchip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px;color:var(--sub);text-decoration:none}
.tagchip:hover{color:var(--teal);border-color:var(--teal)}
.orig ul{margin:6px 0 0;padding-left:18px}
.orig li{margin:3px 0;word-break:break-all;font-size:13.5px}
.tagchip.on{color:var(--ink);border-color:var(--teal);font-weight:700}
.cfgchips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 2px 43px}
.cfg{font-size:11px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--sub);font-family:var(--mono)}
.cfg.off{color:var(--red);border-color:var(--red)}
.cfgrule{margin:0 0 4px 43px}
.cfgpre{font-family:var(--mono);font-size:12px;line-height:1.6;white-space:pre;overflow-x:auto;background:rgba(127,127,127,.07);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:6px 0 12px 43px;color:var(--sub)}
.cfgpre.full{margin-left:0}
.subh{font-weight:700;margin:16px 0 2px}
.ol-list{margin:6px 0 4px;padding-left:20px}
.ol-list li{margin:6px 0;line-height:1.65}
.tips{margin:6px 0 4px;padding-left:18px}
.tips li{margin:5px 0;line-height:1.65}
.help{margin:12px 0 4px}
.help summary{cursor:pointer;color:var(--teal);font-size:13.5px}
.helpbody{color:var(--sub);font-size:13.5px;line-height:1.75;padding:8px 2px 2px}
.helpbody b{color:var(--ink)}
.detail p{margin:12px 0 18px;line-height:1.85}
.orig{margin-top:24px}
.cfgdet{margin:2px 0 10px 43px}
.cfgdet summary{cursor:pointer;color:var(--sub);font-size:12.5px;font-family:var(--mono)}
.cfgdet .cfgpre{margin:8px 0 4px 0}
td a{color:var(--teal)}
.note{color:var(--faint);font-size:12.5px}
.slider-box{display:flex;align-items:center;gap:14px;border:1px solid var(--line);
 background:var(--panel);border-radius:8px;padding:10px 16px;margin-top:12px}
.slider-box input[type=range]{flex:1;accent-color:#5eead4;height:28px;cursor:pointer}
.slider-cap{color:var(--faint);font-size:12px;white-space:nowrap}
.slider-cur{font-family:var(--mono);font-size:13px;color:var(--ink);white-space:nowrap}
@media (max-width:700px){.avatars{display:none}.time{display:none}.deltas{min-width:74px}}
"""


def heat_of(it):
    return (BASE.get(it.get("level"), 10) + 20 * len(it.get("sources") or [])
            + 8 * len(it.get("links") or []) + (25 if it.get("is_new") else 0))


def tokens(s):
    return set(re.findall(r"[A-Za-z0-9]+|[一-鿿]", (s or "").lower()))


HOOK_T = {
    "zh": {"num": "「{name}」——浪高冲到 {heat}，{n} 个来源同时在报。",
           "gap": "{hook} 但真正值得看的，不是这件事本身。",
           "signal": "信号不在热闹那边：「{name}」已经排到第 {rank}，还在发酵。"},
    "en": {"num": "\u201c{name}\u201d — wave height {heat}, {n} sources reporting at once.",
           "gap": "{hook} But the thing worth watching is not the event itself.",
           "signal": "The signal is not where the noise is: \u201c{name}\u201d is already at #{rank} and still developing."},
    "ja": {"num": "「{name}」——波高 {heat}、{n} ソースが同時に報道。",
           "gap": "{hook} ただし本当に見るべきは、出来事そのものではない。",
           "signal": "シグナルは騒がしい側にない：「{name}」はすでに {rank} 位で、まだ発酵中。"},
}

SHORT_TIPS = {
    "zh": ["单贴越短越好：一口气读完为准；英文单贴 110 字符内表现最佳（tweet-writer）。",
           "第一小时最关键：发在受众活跃的时段；链接放文末或回复里，别占正文开头。",
           "具体数字 > 形容词：「浪高 209、5 个来源同时报」比「非常火」可信得多。",
           "钩子公式轮换用：数字型 / 好奇缺口 / 反差观点 / 问题 / 故事，别连用同一种。",
           "Thread 每条独立成立，第一条必须是能单独转发的钩子。"],
    "en": ["Shorter wins: one breath per post; under ~110 characters performs best for single posts (tweet-writer).",
           "The first hour is critical: post when your audience is active; put links at the end or in a reply, not up front.",
           "Specific numbers beat adjectives: 'wave 209, 5 sources at once' over 'it's huge'.",
           "Rotate hook formulas: specific result / curiosity gap / contrarian / question / story.",
           "In a thread, every post must stand alone; the first one must work as a standalone hook."],
    "ja": ["短いほど良い：一息で読める長さに。英語の単独ポストは110文字以内が最適（tweet-writer）。",
           "最初の一時間が勝負：読者が活発な時間帯に投稿し、リンクは末尾か返信へ。",
           "形容詞より具体的な数字：「波高209、5ソース同時報道」は「すごく話題」より信頼される。",
           "フック公式は使い回す：数字型 / 好奇ギャップ / 逆張り / 質問 / 物語。",
           "スレッドは各ポストが独立して成立すること。最初の一件は単独で通用するフックに。"],
}

LONG_TIPS = {
    "zh": ["一篇只讲一个观点：主张说不成一句话，就先别动笔（Hormozi）。",
           "理由不是步骤：从心理、经济、行为、竞争等角度把观点讲透，目标 4–6 条。",
           "节奏参考 Dan Koe：约 40% 短句独立成段、40% 对話式中句、20% 长段展开。",
           "动笔前先定角度：同一话题列几个角度，选信息增量最大的一个（Substack 写作流程）。",
           "说服靠具体：真实数字、真实案例、时间线——形容词最廉价。"],
    "en": ["One piece, one idea: if the claim does not fit in one sentence, do not start writing (Hormozi).",
           "Reasons, not steps: argue the idea from psychological, economic, behavioral and competitive angles — aim for 4–6.",
           "Rhythm after Dan Koe: ~40% ultra-short paragraphs, ~40% conversational medium, ~20% longer expansive passages.",
           "Pick the angle before drafting: list several angles for the same topic, take the one with the most new information (Substack workflow).",
           "Persuasion is concrete: real numbers, real cases, a timeline — adjectives are the cheapest currency."],
    "ja": ["一本に主張は一つ：一文で言えないなら、まだ書くな（Hormozi）。",
           "理由は手順ではない：心理・経済・行動・競合など複数の角度から主張を裏付ける。目標4–6個。",
           "リズムは Dan Koe 参考：約40%が短い独立段落、40%が会話的な中丈、20%が長い展開。",
           "書く前に角度を決める：同じ話題で角度をいくつか挙げ、情報量が最大のものを選ぶ（Substack の流れ）。",
           "説得は具体で：実数、実例、タイムライン。形容詞は一番安い。"],
}

SRC_ALIASES = {
    "hacker news": "hackernews", "show hn": "show_hn", "github": "github",
    "github trending": "github", "x": "x", "product hunt": "producthunt",
    "hugging face": "huggingface", "openrouter": "openrouter",
    "civitai": "civitai", "arxiv": "arxiv", "bluesky": "bluesky",
    "google news": "google_news", "google news 多家": "google_news",
    "google trends": "google_trends", "lobsters": "lobsters",
    "dev.to": "devto", "dev": "devto", "wikipedia": "wikipedia",
    "app store": "app_store", "daily papers": "daily_papers",
    "hf spaces": "hf_spaces", "hugging face spaces": "hf_spaces",
    "federal register": "federal_register", "stack exchange": "stackexchange",
    "github releases": "gh_releases", "google blog": "official_blogs",
    "llama.cpp releases": "gh_releases", "vllm releases": "gh_releases",
    "claude code releases": "gh_releases",
}
OFFICIAL_HINTS = ("官方", "official", "openai", "deepmind", "anthropic",
                  "mistral", "nvidia", "blog.google", "bair", "langchain",
                  "ollama", "databricks", "cloudflare", "mozilla",
                  "federal register", "changelog")
TECH_HINTS = ("techcrunch", "the verge", "wired", "ars technica", "the decoder",
              "venturebeat", "fortune", "cnbc", "reuters", "bbc", "nyt", "wsj",
              "cbs", "usa today", "the guardian", "bloomberg", "forbes",
              "technology review", "techmeme", "the information", "semafor",
              "semianalysis", "platformer", "lesswrong", "one useful thing",
              "y combinator", "yc blog", "stack exchange")


def _yaml_source_blocks(text):
    """Split the sources: section of a YAML config into per-group blocks,
    dedented, exactly as written in the settings file."""
    blocks, cur, buf = {}, None, []

    def flush():
        if cur is not None:
            blocks[cur] = "\n".join(buf).rstrip()

    in_sources = False
    for ln in text.split("\n"):
        if re.match(r"^sources:\s*$", ln):
            in_sources = True
            continue
        if not in_sources:
            continue
        if ln and not ln.startswith((" ", "#", "\t")):
            break  # next top-level key ends the sources section
        m = re.match(r"^  ([A-Za-z0-9_]+):\s*$", ln)
        if m:
            flush()
            cur, buf = m.group(1), [ln[2:]]
            continue
        if cur is not None:
            buf.append(ln[2:] if ln.startswith("  ") else ln)
    flush()
    return blocks


def load_config_blocks():
    """Per-source-group config text, verbatim from the settings file:
    config.yaml/.yml wins, then config.example.yaml; JSON configs fall
    back to a per-group JSON dump."""
    for name in ("config.yaml", "config.yml", "config.example.yaml",
                 "config.example.yml"):
        p = ROOT / name
        if p.exists():
            try:
                return _yaml_source_blocks(p.read_text(encoding="utf-8"))
            except Exception:
                return {}
    for name in ("config.json", "config.example.json"):
        p = ROOT / name
        if p.exists():
            try:
                srcs = json.loads(p.read_text(encoding="utf-8")).get("sources") or {}
                return {k: json.dumps({k: v}, ensure_ascii=False, indent=2)
                        for k, v in srcs.items()}
            except Exception:
                return {}
    return {}


def source_key(name):
    """Map an edition's display source name to its fetcher-group key."""
    low = name.lower()
    key = SRC_ALIASES.get(low)
    if not key and low.startswith("reddit"):
        key = "reddit"
    if not key and low.startswith("mastodon"):
        key = "mastodon"
    if not key and any(h in low or h in name for h in OFFICIAL_HINTS):
        key = "official_blogs"
    if not key and any(h in low for h in TECH_HINTS):
        key = "tech_media"
    if not key and "sitemap" in low:
        key = "sitemaps"
    return key


def source_block(name, blocks):
    """The source's fetcher-group config block (verbatim settings text)."""
    key = source_key(name)
    return blocks.get(key) if key else None


def load(editions_dir=None):
    files = sorted(glob.glob(str(Path(editions_dir or ROOT / "editions") / "*.json")),
                   key=lambda p: (re.search(r"(\d{4}-\d{2}-\d{2})-(\w+)", p).group(1),
                                  SLOT.get(re.search(r"(\d{4}-\d{2}-\d{2})-(\w+)", p).group(2), ("", 9))[1]))
    editions = []
    for f in files:
        ed = json.loads(Path(f).read_text(encoding="utf-8"))
        for it in ed["items"]:
            it["_heat"] = heat_of(it)
        ranked = sorted(ed["items"], key=lambda x: -x["_heat"])
        for i, it in enumerate(ranked, 1):
            it["_rank"] = i
        editions.append(ed)
    ledger_path = ROOT / "state" / "seen-topics.json"
    ledger = (json.loads(ledger_path.read_text(encoding="utf-8"))["topics"]
              if ledger_path.exists() else [])
    return editions, ledger


def topic_key(it, ledger):
    title = it.get("title") or ""
    if "Anthropic" in title:
        return "arc:anthropic", "Anthropic IPO"
    if any(k in title for k in ("黄仁勋", "英伟达", "Nvidia")):
        return "arc:nvidia", "黄仁勋 / Nvidia 风波"
    tt = tokens(title)
    best, best_n = None, 0
    for t in ledger:
        n = len(tt & tokens(t["name"]))
        if n > best_n:
            best, best_n = t, n
    if best is not None and best_n >= 6:
        return "led:" + best["name"], best["name"]
    return "own:" + title, title


def build_topics(editions, ledger):
    topics = {}
    order = []
    for ei, ed in enumerate(editions):
        for it in ed["items"]:
            key, name = topic_key(it, ledger)
            if key not in topics:
                topics[key] = {"key": key, "name": name, "apps": []}
                order.append(key)
            topics[key]["apps"].append({
                "edition": ei, "date": ed["date"], "slot": ed.get("slot"),
                "published": ed.get("published_at"),
                "category": classify(it.get("title") or "", it.get("body") or ""),
                "title": it.get("title") or name, "level": it.get("level"),
                "heat": it["_heat"], "rank": it["_rank"],
                "sources": it.get("sources") or [], "links": it.get("links") or [],
                "body": it.get("body") or "", "action": it.get("action") or "",
                "is_new": bool(it.get("is_new")),
            })
    used_slugs = set()
    for i, key in enumerate(order, 1):
        t = topics[key]
        t["id"] = f"t{i:02d}"
        base = slugify(t["apps"][0]["title"], t["id"])
        slug, n = base, 2
        while (slug in used_slugs or slug in RESERVED_FILES
               or slug.startswith(("edition-", "category-", "level-", "board-"))):
            slug = f"{base}-{n}"
            n += 1
        used_slugs.add(slug)
        t["slug"] = slug
        t["name"] = t["apps"][-1]["title"] if not key.startswith("arc:") else t["name"]
        for j, app in enumerate(t["apps"]):
            if j == 0:
                app["heat_delta"] = None
                app["rank_delta"] = None
            else:
                prev = t["apps"][j - 1]
                app["heat_delta"] = app["heat"] - prev["heat"]
                app["rank_delta"] = prev["rank"] - app["rank"]
    return [topics[k] for k in order]


TRACK_LEVELS = {"🔥": "must", "👀": "watch", "🌱": "seed"}


def parse_track_record(path=None):
    """Parse track-record.md (the human-maintained ledger at the repo root)
    into structured data. The Markdown stays the single source of truth:
    edition sections look like ``## 2026-11-11 试点期（复核日 2026-11-25）``
    followed by a table of ``| 级别 | 话题 | 复核标准 | 结果 |`` rows."""
    p = Path(path) if path else ROOT / "track-record.md"
    data = {"groups": [], "total": 0, "reviewed": 0, "hits": 0,
            "first_review": ""}
    if not p.exists():
        return data
    cur = None
    for ln in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(\d{4}-\d{2}-\d{2})\s+(.+?)（复核日\s*(\d{4}-\d{2}-\d{2})）\s*$", ln)
        if m:
            cur = {"date": m.group(1), "label": m.group(2).strip(),
                   "review_date": m.group(3), "entries": []}
            data["groups"].append(cur)
            continue
        if cur is None or not ln.startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) != 4 or cells[0] not in TRACK_LEVELS:
            continue  # header / separator / other tables
        entry = {"level": TRACK_LEVELS[cells[0]], "emoji": cells[0],
                 "topic": cells[1], "criteria": cells[2], "result": cells[3],
                 "review_date": cur["review_date"]}
        cur["entries"].append(entry)
        data["total"] += 1
        if entry["result"]:
            data["reviewed"] += 1
            if "命中" in entry["result"] and "未命中" not in entry["result"]:
                data["hits"] += 1
    dates = [g["review_date"] for g in data["groups"] if g["entries"]]
    data["first_review"] = min(dates) if dates else ""
    return data


_KEYWORD_STOP = {"the", "and", "for", "with", "from", "that", "this",
                 "new", "its", "are", "was"}


def title_keywords(title):
    """Distinctive match keywords derived from a topic title, for the
    extension badge matcher (case-insensitive substring checks)."""
    title = title or ""
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", title)
             if w.lower() not in _KEYWORD_STOP]
    kws = []

    def add(k):
        k = (k or "").strip()
        if k and k not in kws:
            kws.append(k)

    for i, w in enumerate(words):
        add(w)
        if i + 1 < len(words):
            add(f"{words[i]} {words[i + 1]}")
            add(f"{words[i]}-{words[i + 1]}")
    for run in re.findall(r"[一-鿿]{2,}", title):
        add(run if len(run) <= 8 else run[:4])
    add(title)
    return kws[:10]


def topics_data(editions, topics):
    """data/topics.json payload (G3-lite): every current topic with the
    fields the extension badge matches on."""
    out = []
    for t in topics:
        last, first = t["apps"][-1], t["apps"][0]
        patterns, seen = [], set()
        for a in t["apps"]:
            for u in a["links"]:
                pr = urlparse(u)
                pat = (pr.netloc + pr.path).rstrip("/")
                if pat and pat not in seen:
                    seen.add(pat)
                    patterns.append(pat)
        out.append({"slug": t["slug"], "title": t["name"],
                    "heat": last["heat"], "first_seen": first["date"],
                    "level": last["level"], "url_patterns": patterns,
                    "title_keywords": title_keywords(t["name"])})
    gen = editions[-1].get("published_at") if editions else ""
    return {"generated_at": gen, "topics": out}


def alerts_data(editions, topics):
    """data/alerts.json payload (C1): deterministic alerts for the latest
    edition. resonance = topic first seen in the latest edition with
    >=2 independent sources; surge = board heat gain >= 30 versus the
    previous time point, existing topics only (Dai 2026-11-15: a topic
    new to the board reports resonance only, never surge — this differs
    from the Rising board, which counts a new topic's full heat)."""
    if not editions:
        return {"generated_at": "", "alerts": []}
    latest_ei = len(editions) - 1
    latest = editions[latest_ei]
    gen = latest.get("published_at") or ""
    ed_key = f"{latest['date']}-{latest.get('slot')}"
    # Board states, carried forward like the board itself.
    states, prev = [], {}
    for ei in range(len(editions)):
        cur = {}
        for t in topics:
            apps_le = [a for a in t["apps"] if a["edition"] <= ei]
            if apps_le:
                cur[t["key"]] = apps_le[-1]["heat"]
        states.append(cur)
    prev_state = states[-2] if len(states) >= 2 else {}
    by_key = {t["key"]: t for t in topics}
    alerts, seen_keys = [], set()

    def add(t, reason, before, after):
        dk = f"{t['slug']}:{reason}:{ed_key}"
        if dk in seen_keys:
            return
        seen_keys.add(dk)
        alerts.append({"topic_slug": t["slug"], "title": t["name"],
                       "reason": reason, "heat_before": before,
                       "heat_after": after, "edition": gen,
                       "triggered_at": gen, "dedupe_key": dk})

    for t in topics:
        first = t["apps"][0]
        if first["edition"] == latest_ei and len(first["sources"]) >= 2:
            add(t, "resonance", 0, first["heat"])
    for key, heat in states[-1].items():
        before = prev_state.get(key)
        if before is None:
            continue  # new to the board: resonance only, no surge
        if heat - before >= 30:
            add(by_key[key], "surge", before, heat)
    alerts.sort(key=lambda a: (a["topic_slug"], a["reason"]))
    return {"generated_at": gen, "alerts": alerts}


def write_data_files(out, editions, topics):
    """Write the static data layer (data/topics.json + data/alerts.json)
    at the site root; the extension consumes exactly these files."""
    d = Path(out) / "data"
    d.mkdir(parents=True, exist_ok=True)
    (d / "topics.json").write_text(
        json.dumps(topics_data(editions, topics), ensure_ascii=False, indent=1),
        encoding="utf-8")
    (d / "alerts.json").write_text(
        json.dumps(alerts_data(editions, topics), ensure_ascii=False, indent=1),
        encoding="utf-8")


def ed_label(ed):
    """Conventional timestamp for an edition: YYYY-MM-DD HH:MM."""
    pa = ed.get("published_at") or ""
    if len(pa) >= 16:
        return f"{pa[:10]} {pa[11:16]}"
    return ed["date"]


def ed_file(ed):
    return f"edition-{ed['date']}-{ed.get('slot')}.html"


CAT_KEYS = {"安全": "security", "政策与监管": "policy", "开源": "open-source",
            "商业与资本": "business", "Agent 与应用": "agent",
            "AI 模型": "ai-models", "行业动态": "industry"}


def cat_key(cat):
    return CAT_KEYS.get(cat, "industry")


def cat_file(cat):
    return f"category-{cat_key(cat)}.html"


RESERVED_FILES = {"index", "rising", "seeds", "categories", "sources",
                  "archive", "about", "feed", "sitemap", "robots", "llms",
                  "track-record", "submit", "data"}


def slugify(title, fallback):
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+",
               "-", (title or "").lower())
    s = re.sub(r"-+", "-", s).strip("-")[:48].strip("-")
    return s or fallback


def topic_file(t):
    return f"{t['slug']}.html"


def topic_href(t):
    return quote(topic_file(t), safe="-._~")


SHARE_ICONS = {
    "x": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L2 3h6.4l4.4 5.9L17.8 3zm-1.1 16.1h1.7L7.4 4.8H5.6l11.1 14.3z"/></svg>',
    "facebook": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.6-1.5h1.4V4.4c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.5H8.3v3h2.5V21h2.7z"/></svg>',
    "linkedin": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="3" y="9" width="3.4" height="9.5"/><circle cx="4.7" cy="4.9" r="1.9"/><path d="M9.5 18.5V9h3v1.4c.5-.9 1.6-1.7 3.3-1.7 2.6 0 4.2 1.7 4.2 5.1v4.7h-3.4v-4.3c0-1.5-.6-2.5-2-2.5-1.4 0-2.3.9-2.3 2.5v4.3H9.5z"/></svg>',
    "telegram": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M21.9 3.3l-3.1 14.6c-.2 1-.8 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.7-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L7.2 11.6 2.7 10.2c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.4 1.3z"/></svg>',
    "email": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3 5h18c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V6c0-.6.4-1 1-1zm9 7.4L4.2 7h15.6L12 12.4z"/></svg>',
    "reddit": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><circle cx="12" cy="13.2" r="6.8"/><path d="M12 6.4l1.1-3.6 3.4.8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18.6" cy="3.4" r="1.4"/></svg>',
    "weibo": "",
    "copy": '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M10.6 13.4a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1.5 1.5 1.4 1.4 1.5-1.5a2 2 0 112.9 2.9l-3 3a2 2 0 01-2.9 0 2 2 0 010-2.9l1.5-1.5-1.4-1.4-1.5 1.5a4 4 0 000 5.8zM13.4 10.6a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1.5-1.5-1.4-1.4-1.5 1.5a2 2 0 11-2.9-2.9l3-3a2 2 0 012.9 0 2 2 0 010 2.9l-1.5 1.5 1.4 1.4 1.5-1.5a4 4 0 000-5.8z"/></svg>',
}
SHARE_PLATFORMS = {
    "x": ("X", "https://twitter.com/intent/tweet?text={t}&url={u}"),
    "facebook": ("Facebook", "https://www.facebook.com/sharer/sharer.php?u={u}"),
    "linkedin": ("LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url={u}"),
    "telegram": ("Telegram", "https://t.me/share/url?url={u}&text={t}"),
    "reddit": ("Reddit", "https://www.reddit.com/submit?url={u}&title={t}"),
    "email": ("Email", "mailto:?subject={t}&body={u}"),
    "weibo": ("微博", "https://service.weibo.com/share/share.php?url={u}&title={t}"),
}
SHARE_KEYS = [k.strip() for k in
              os.environ.get("TS_SHARE", "x,facebook,linkedin,telegram,reddit,email,copy").split(",")
              if k.strip()]


def share_links(url, text):
    q_url, q_text = quote(url, safe=""), quote(text)
    out = []
    for key in SHARE_KEYS:
        if key == "copy":
            out.append(
                '<button class="sh" type="button" onclick="if(navigator.clipboard)'
                'navigator.clipboard.writeText(location.href);this.lastChild.textContent=\''
                + s("copied") + '\'">' + SHARE_ICONS["copy"]
                + f'<span>{s("copy_link")}</span></button>')
        elif key in SHARE_PLATFORMS:
            label, tpl = SHARE_PLATFORMS[key]
            href = tpl.format(u=q_url, t=q_text)
            out.append(f'<a class="sh" href="{href}" target="_blank" rel="noopener">'
                       f'{SHARE_ICONS.get(key, "")}<span>{label}</span></a>')
    return "".join(out)


def favicon():
    return '<img class="mastmark" src="icon-96.png" alt="">' 


def mast(active, editions, current_ei=None, fname="index.html", tl=False):
    hrefs = ["index.html", "rising.html", "seeds.html", "categories.html",
             "sources.html", "track-record.html", "archive.html", "about.html"]
    keys = ["index", "rising", "seeds", "categories", "sources", "track", "archive", "about"]
    tab_html = "".join(
        f'<a href="{h}" class="{"on" if k == active else ""}">{n}</a>'
        for h, n, k in zip(hrefs, s("tabs"), keys))
    ctl = f'<button class="theme-btn" id="themeBtn" type="button" title="{s("theme")}">◐</button>'
    if len(LANGS) > 2:
        root = "" if CUR["lang"] == "zh" else "../"
        links = "".join(
            f'<a href="{root}{"" if L == "zh" else L + "/"}{fname}" '
            f'class="{"on" if L == CUR["lang"] else ""}">{LANG_LABEL[L]}</a>' for L in LANGS)
        ctl += f'<span class="langs">{links}</span>'
    tl_html = ""
    if tl and editions:
        n = len(editions)
        step = max(1, -(-n // 8))
        ticks = ""
        for i, ed in enumerate(editions):
            on = " on" if i == current_ei else ""
            dim = " dim" if (i % step and i != current_ei and i != n - 1) else ""
            ticks += (f'<span class="tick{on}{dim}"><a href="{ed_file(ed)}" data-i="{i}">'
                      f'{ed_label(ed)}</a></span>')
        tl_html = f'<div class="ticks-scroll"><div class="timeline tight">{ticks}</div></div>'
    return f"""<header class="mast">{favicon()}<div><div class="wordmark">BREAKER DELTA</div>
<div class="pg-title">{s("pg_title")}</div></div><div class="mast-ctl">{ctl}</div></header>
<nav class="tabs">{tab_html}</nav>{tl_html}"""


def delta_chips(app):
    if app["heat_delta"] is None:
        return f'<span class="dchip new">{s("new")}</span>'
    hd, rd = app["heat_delta"], app["rank_delta"]
    h_cls = "up" if hd > 0 else "down" if hd < 0 else ""
    h_txt = f"{s('wave')} {'+' if hd > 0 else ''}{hd}" if hd != 0 else f"{s('wave')} →0"
    if rd > 0:
        r_txt, r_cls = f"{s('rank')} ▲{rd}", "up"
    elif rd < 0:
        r_txt, r_cls = f"{s('rank')} ▼{-rd}", "down"
    else:
        r_txt, r_cls = f"{s('rank')} →", ""
    return f'<span class="dchip {h_cls}">{h_txt}</span><span class="dchip {r_cls}">{r_txt}</span>'


def avatar_stack(sources):
    avs = ""
    for s in sources[:4]:
        dom = SOURCE_DOMAINS.get(s)
        if dom and dom in FAV_FILES:
            avs += (f'<img class="avimg" src="favicons/{FAV_FILES[dom]}" '
                    f'alt="{html.escape(s)}" title="{html.escape(s)}" loading="lazy">')
        else:
            hue = sum(ord(c) for c in s) % 360
            initial = next((c for c in s if c.isalnum()), s[:1])
            avs += (f'<span class="av" style="background:hsl({hue} 65% 72%)" '
                    f'title="{html.escape(s)}">{html.escape(initial)}</span>')
    extra = f'<span class="more-n">+{len(sources) - 4}</span>' if len(sources) > 4 else ""
    return f'<span class="avatars">{avs}{extra}</span>'


def tstamp(app):
    p = app.get("published") or ""
    if len(p) >= 16:
        return f"{p[5:10]} {p[11:16]}"
    return (app.get("date") or "")[5:]


def row_html(rank, topic, app, show_level=False):
    emoji = LEVELS.get(app["level"], LEVELS["seed"])[0]
    badge = (f' <a class="badge" href="level-{app["level"]}.html">{emoji}{level_label(app["level"])}</a>'
             if show_level else "")
    carried = f' <span class="note">{s("carried")}</span>' if app.get("carried") else ""
    tag = (f'<a class="tag" href="{cat_file(app["category"])}">{html.escape(cat_name(app["category"]))}</a>'
           if app.get("category") else "")
    time = f'<span class="time">{tstamp(app)}</span>'
    spark = spark_svg(trend_points(topic, app))
    rd = app.get("rank_delta")
    if rd is None:
        rdelta = f'<span class="hdelta new">{s("new")}</span>'
        prank = ""
    elif rd > 0:
        rdelta = f'<span class="hdelta up">▲{rd}</span>'
        prank = f'<span class="prank">{s("prev")} {rank + rd}</span>'
    elif rd < 0:
        rdelta = f'<span class="hdelta down">▼{-rd}</span>'
        prank = f'<span class="prank">{s("prev")} {rank + rd}</span>'
    else:
        rdelta = '<span class="hdelta">→</span>'
        prank = f'<span class="prank">{s("prev")} {rank}</span>'
    hd = app.get("heat_delta")
    if hd is None:
        hdelta = f'<span class="hdelta new">{s("new")}</span>'
    elif hd > 0:
        hdelta = f'<span class="hdelta up">▲{hd}</span>'
    elif hd < 0:
        hdelta = f'<span class="hdelta down">▼{-hd}</span>'
    else:
        hdelta = '<span class="hdelta">→0</span>'
    return f"""<div class="row"><span class="rank {'top' if rank <= 3 else ''}">{rank}{rdelta}{prank}</span>
<span class="rtitle"><a href="{topic_href(topic)}">{html.escape(app['title'])}</a>{badge}{carried}</span>
{tag}{time}
{avatar_stack(app['sources'])}
<span class="heat"><span class="spark">{spark}</span><span class="hv"><b>{app['heat']}</b> <span>{s('wave')}</span> {hdelta}</span></span></div>"""


def page(title, body, desc=None, path="index.html", ld=None):
    desc = desc or s("desc_default")
    url = BASE_URL + lang_prefix() + path
    e = lambda s: html.escape(s or "", quote=True)
    otype = "article" if (ld or {}).get("@type") == "NewsArticle" else "website"
    og_img = (f'<meta property="og:image" content="{BASE_URL}og-image.png">'
              f'<meta name="twitter:image" content="{BASE_URL}og-image.png">') if OG_IMG else ""
    ld_html = (f'<script type="application/ld+json">'
               f'{json.dumps(ld, ensure_ascii=False)}</script>') if ld else ""
    hreflang = "".join(
        f'<link rel="alternate" hreflang="{HTML_LANG[L]}" '
        f'href="{BASE_URL}{"" if L == "zh" else L + "/"}{path}">' for L in LANGS)
    hreflang += f'<link rel="alternate" hreflang="x-default" href="{BASE_URL}{path}">'
    theme_head = ('<script>try{var t=localStorage.getItem("ts-theme");'
                  'if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>')
    theme_bind = ('<script>var tb=document.getElementById("themeBtn");if(tb){'
                  'tb.addEventListener("click",function(){var h=document.documentElement;'
                  'var n=h.getAttribute("data-theme")==="light"?"":"light";'
                  'if(n){h.setAttribute("data-theme",n)}else{h.removeAttribute("data-theme")}'
                  'try{localStorage.setItem("ts-theme",n)}catch(e){}})}</script>')
    return (f'<!DOCTYPE html>\n<html lang="{HTML_LANG[CUR["lang"]]}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<meta name="description" content="{e(desc)}">'
            f'<link rel="canonical" href="{url}">{hreflang}'
            f'<link rel="icon" type="image/svg+xml" href="favicon.svg">'
            f'<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">'
            f'<link rel="apple-touch-icon" href="apple-touch-icon.png">'
            f'<link rel="alternate" type="application/rss+xml" title="{e(s("site_name"))} RSS" href="feed.xml">'
            f'<link rel="alternate" type="application/atom+xml" title="{e(s("site_name"))} Atom" href="atom.xml">'
            f'<meta property="og:type" content="{otype}">'
            f'<meta property="og:site_name" content="{e(s("site_name"))}">'
            f'<meta property="og:title" content="{e(title)}">'
            f'<meta property="og:description" content="{e(desc)}">'
            f'<meta property="og:url" content="{url}">{og_img}'
            f'<meta name="twitter:card" content="summary_large_image">'
            f'<meta name="twitter:site" content="@daiyanze">'
            f'<meta name="twitter:title" content="{e(title)}">'
            f'<meta name="twitter:description" content="{e(desc)}">'
            f'<title>{e(title)} · Breaker Delta</title>{theme_head}<style>{CSS}</style>{ld_html}</head>'
            f'<body><div class="wrap">{body}</div>{theme_bind}</body></html>')


def wave_chart(topic, editions):
    apps = topic["apps"]
    W, H, L, R, T, B = 1020, 300, 46, 30, 18, 34
    iw, ih = W - L - R, H - T - B
    vmax = max(a["heat"] for a in apps) * 1.15 or 1
    xs = {a["edition"]: L + a["edition"] * iw * (2 / 3) / max(1, len(editions) - 1) for a in apps}
    y = lambda v: T + ih - v / vmax * ih
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img">',
           '<defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#5eead4" stop-opacity=".38"/>'
           '<stop offset="1" stop-color="#5eead4" stop-opacity=".03"/></linearGradient></defs>']
    for gv in (0, 0.25, 0.5, 0.75, 1.0):
        v = vmax * gv
        out.append(f'<line x1="{L}" y1="{y(v):.0f}" x2="{W-R}" y2="{y(v):.0f}" stroke="rgba(255,255,255,.07)"/>'
                   f'<text x="{L-8}" y="{y(v)+4:.0f}" fill="#5f7189" font-size="11" text-anchor="end">{v:.0f}</text>')
    pts = [(xs[a["edition"]], y(a["heat"])) for a in apps]
    if len(pts) >= 2:
        line = " ".join(f"{a:.0f},{b:.0f}" for a, b in pts)
        area = f"M{pts[0][0]:.0f},{y(0):.0f} " + " ".join(f"L{a:.0f},{b:.0f}" for a, b in pts) + f" L{pts[-1][0]:.0f},{y(0):.0f} Z"
        out.append(f'<path d="{area}" fill="url(#wgrad)"/>')
        out.append(f'<polyline points="{line}" fill="none" stroke="#5eead4" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>')
    for a, (px, py) in zip(apps, pts):
        out.append(f'<a href="{ed_file(editions[a["edition"]])}"><circle cx="{px:.0f}" cy="{py:.0f}" r="5" fill="#0a0e13" stroke="#5eead4" stroke-width="2.4"/></a>'
                   f'<text x="{px:.0f}" y="{py-12:.0f}" fill="#e8eef5" font-size="12.5" font-weight="700" text-anchor="middle">{a["heat"]}</text>'
                   f'<text x="{px:.0f}" y="{H-12}" fill="#5f7189" font-size="11" text-anchor="middle">{ed_label(editions[a["edition"]])}</text>')
    out.append("</svg>")
    return "".join(out)


def foot():
    return (f'<footer><div class="copy">© 2026 Dai · <a href="about.html">{s("foot_about")}</a> · '
            f'<a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub</a> · '
            f'<a href="https://x.com/daiyanze" rel="noopener">X</a> · '
            f'<a href="feed.xml">RSS</a> · <a href="atom.xml">Atom</a></div></footer>')


def build(base_url=None, out_dir=None, editions_dir=None):
    """Build the whole site; returns the list of written HTML paths."""
    if base_url:
        globals()["BASE_URL"] = base_url.rstrip("/") + "/"
    out = Path(out_dir) if out_dir else OUT
    globals()["OUT"] = out
    out.mkdir(parents=True, exist_ok=True)
    editions, ledger = load(editions_dir)
    topics = build_topics(editions, ledger)
    domains = sorted({SOURCE_DOMAINS[s] for t in topics for a in t["apps"]
                      for s in a["sources"] if s in SOURCE_DOMAINS})
    fetch_favicons(domains)
    banner = ROOT / "assets" / "banner.png"
    if banner.exists():
        globals()["OG_IMG"] = True
    brand = ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "banner.png", "icon-96.png"]
    for lang in LANGS:
        CUR["lang"] = lang
        od = out if lang == "zh" else out / lang
        od.mkdir(parents=True, exist_ok=True)
        if banner.exists():
            shutil.copy(banner, od / "og-image.png")
        for bf in brand:
            srcf = ROOT / "assets" / bf
            if srcf.exists():
                shutil.copy(srcf, od / bf)
        build_site(od, editions, topics)
    CUR["lang"] = "zh"
    write_data_files(out, editions, topics)
    write_discovery(editions, topics)
    return sorted(out.rglob("*.html"))


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Build the triple-sigma site.")
    ap.add_argument("--base-url", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    build(base_url=args.base_url, out_dir=args.out)


def write_discovery(editions, topics):
    latest = editions[-1]
    default_mod = (latest.get("published_at") or "")[:10]
    mod_map = {topic_file(t): (t["apps"][-1].get("published") or default_mod)[:10]
               for t in topics}
    mod_map.update({ed_file(ed): (ed.get("published_at") or default_mod)[:10] for ed in editions})
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for lang in LANGS:
        prefix = "" if lang == "zh" else lang + "/"
        folder = OUT if lang == "zh" else OUT / lang
        for f in sorted(folder.glob("*.html")):
            if re.fullmatch(r"topic-t\d+\.html", f.name):
                continue  # redirect stub, noindex
            sm.append(f"<url><loc>{BASE_URL}{prefix}{quote(f.name, safe='-._~')}</loc>"
                      f"<lastmod>{mod_map.get(f.name, default_mod)}</lastmod></url>")
    sm.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")
    (OUT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {BASE_URL}sitemap.xml\n", encoding="utf-8")
    sts = sorted(topics, key=lambda t: -t["apps"][-1]["heat"])[:10]
    top_links = "\n".join(
        f"- [{t['apps'][-1]['title']}]({BASE_URL}{topic_href(t)})" for t in sts)
    lang_links = "\n".join(
        f"- [{HTML_LANG[L]}]({BASE_URL}{'' if L == 'zh' else L + '/'}index.html)" for L in LANGS)
    llms = (f"# 浪尖雷达 Breaker Delta\n\n> 用「浪高」量化话题走势的热点雷达：海浪榜（全部话题按浪高排名）、"
            f"涨潮榜（浪高涨幅）、苗头（新出现的话题），每个话题有独立页面与海浪图（浪高历史走势）。\n\n"
            f"## 主要页面\n- [海浪榜]({BASE_URL}index.html)\n- [涨潮榜]({BASE_URL}rising.html)\n"
            f"- [苗头]({BASE_URL}seeds.html)\n- [分类]({BASE_URL}categories.html)\n"
            f"- [数据源]({BASE_URL}sources.html)\n- [战绩]({BASE_URL}track-record.html)\n"
            f"- [投苗]({BASE_URL}submit.html)\n- [关于]({BASE_URL}about.html)\n"
            f"- [往期归档]({BASE_URL}archive.html)\n- [RSS]({BASE_URL}feed.xml)\n"
            f"- [Atom]({BASE_URL}atom.xml)\n\n## 语言版本\n{lang_links}\n\n## 当前浪高最高的话题\n{top_links}\n")
    (OUT / "llms.txt").write_text(llms, encoding="utf-8")


def build_site(OUT, editions, topics):
    for f in OUT.glob("*.html"):
        f.unlink()
    fav_out = OUT / "favicons"
    if fav_out.exists():
        shutil.rmtree(fav_out)
    fav_out.mkdir()
    for dom, fname in FAV_FILES.items():
        shutil.copy(FAV_CACHE / fname, fav_out / fname)
    by_slug = {t["slug"]: t for t in topics}
    latest_ei = len(editions) - 1
    latest = editions[latest_ei]

    def heat_help():
        """Collapsible explainer: how 浪高 is calculated. Auxiliary content —
        hidden until clicked."""
        return (f'<details class="help"><summary>{s("heat_help_t")}</summary>'
                f'<div class="helpbody">{s("heat_help")}</div></details>')


    def app_of(t, ei):
        return next((a for a in t["apps"] if a["edition"] == ei), None)

    # index: 海浪榜 with draggable time slider (all editions embedded,
    # latest rendered statically as the no-JS fallback)
    tmap = {}
    for t in topics:
        for a in t["apps"]:
            tmap[(a["edition"], a["title"])] = (t, a)

    # Board states: at each edition, every topic known so far, valued at its
    # most recent appearance (carried forward when not updated that edition).
    # The board IS the feed: all topics, ranked, 100 per page.
    states = []
    prev = {}
    for ei in range(len(editions)):
        cur = {}
        for t in topics:
            apps_le = [a for a in t["apps"] if a["edition"] <= ei]
            if not apps_le:
                continue
            a = apps_le[-1]
            cur[t["key"]] = {"topic": t, "app": a, "heat": a["heat"],
                             "carried": a["edition"] != ei}
        ranked = sorted(cur.values(), key=lambda x: -x["heat"])
        for i, st in enumerate(ranked, 1):
            st["rank"] = i
            pa = prev.get(st["topic"]["key"])
            st["heat_delta"] = (st["heat"] - pa["heat"]) if pa else None
            st["rank_delta"] = (pa["rank"] - i) if pa else None
        states.append({st["topic"]["key"]: st for st in ranked})
        prev = {k: {"heat": v["heat"], "rank": v["rank"]} for k, v in states[-1].items()}
    for t in topics:
        prev_br = None
        for a in t["apps"]:
            st = states[a["edition"]].get(t["key"])
            a["board_rank"] = st["rank"] if st else a["rank"]
            a["board_rank_delta"] = (prev_br - a["board_rank"]) if prev_br is not None else None
            prev_br = a["board_rank"]

    def board_rows(ei):
        sts = sorted(states[ei].values(), key=lambda x: x["rank"])
        out = []
        for st in sts[:PER]:
            a = dict(st["app"])
            a["heat_delta"], a["rank_delta"] = st["heat_delta"], st["rank_delta"]
            a["carried"] = st["carried"]
            out.append(row_html(st["rank"], st["topic"], a))
        return "".join(out), len(sts)

    # Slider states: only the most recent 60 time points are embedded, as
    # compact JSON; rows render on demand in JS and are cached per state.
    # Page weight stays flat no matter how many editions accumulate.
    MAX_STATES = 60
    win = list(range(max(0, len(editions) - MAX_STATES), len(editions)))
    counts = {ei: len(states[ei]) for ei in win}

    def row_data(st):
        a = st["app"]
        srcs = []
        for src in a["sources"][:4]:
            dom = SOURCE_DOMAINS.get(src)
            if dom and dom in FAV_FILES:
                srcs.append({"img": FAV_FILES[dom], "n": src})
            else:
                srcs.append({"ch": next((c for c in src if c.isalnum()), src[:1]),
                             "hue": sum(ord(c) for c in src) % 360, "n": src})
        return {"r": st["rank"], "file": topic_href(st["topic"]), "title": a["title"],
                "cat": cat_name(a["category"]), "ck": cat_key(a["category"]), "time": tstamp(a),
                "pr": (st["rank"] + st["rank_delta"]) if st["rank_delta"] is not None else None,
                "heat": a["heat"], "hd": st["heat_delta"], "rd": st["rank_delta"],
                "carried": st["carried"], "srcs": srcs,
                "more": max(0, len(a["sources"]) - 4),
                "sp": trend_points(st["topic"], a)}

    slider_states = []
    for ei in win:
        sts = sorted(states[ei].values(), key=lambda x: x["rank"])[:PER]
        slider_states.append({"label": ed_label(editions[ei]),
                              "rows": [row_data(st) for st in sts]})
    labels = [x["label"] for x in slider_states]
    latest_rows_html, _ = board_rows(latest_ei)
    slider = (f'<div class="slider-box"><span class="slider-cap">{s("slider")}</span>'
              f'<input type="range" id="tslider" min="0" max="{len(win) - 1}" step="1" value="{len(win) - 1}">'
              f'<span class="slider-cur" id="tlabel">{labels[-1]} · {s("current")}</span></div>')
    i18n_js = {"wave": s("wave"), "rank": s("rank"), "carried": s("carried"),
               "new": s("new"), "current": s("current"), "hist": s("hist"),
               "count": s("count"), "prev": s("prev")}
    script = ("<script>const D=" + json.dumps(slider_states, ensure_ascii=False)
              + ",T=" + json.dumps(i18n_js, ensure_ascii=False)
              + ";const sl=document.getElementById('tslider'),bd=document.getElementById('board'),"
                "lb=document.getElementById('tlabel'),ct=document.getElementById('tcount'),"
                "tk=[...document.querySelectorAll('.tick')];const cache={};"
                "function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}"
                "function spark(p){if(!p||!p.length)return '';"
                "if(p.length===1)return '<svg class=\"spark-svg\" viewBox=\"0 0 64 26\" width=\"64\" height=\"26\"><circle cx=\"60\" cy=\"13\" r=\"2.6\" fill=\"currentColor\"/></svg>';"
                "const lo=Math.min(...p),hi=Math.max(...p),rg=(hi-lo)||1,W=64,H=26,P=3;"
                "const pts=p.map((v,i)=>[P+i*(W-2*P)/(p.length-1),H-P-(v-lo)/rg*(H-2*P)]);"
                "const line=pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ');"
                "const area='M'+pts[0][0].toFixed(1)+','+H+' '+pts.map(q=>'L'+q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')+' L'+pts[pts.length-1][0].toFixed(1)+','+H+' Z';"
                "const e=pts[pts.length-1];"
                "return '<svg class=\"spark-svg\" viewBox=\"0 0 64 26\" width=\"64\" height=\"26\"><path d=\"'+area+'\" fill=\"currentColor\" opacity=\".16\"/><polyline points=\"'+line+'\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"'+e[0].toFixed(1)+'\" cy=\"'+e[1].toFixed(1)+'\" r=\"2.6\" fill=\"currentColor\"/></svg>'}"
                "function hdHtml(d){if(d.hd===null)return '<span class=\"hdelta new\">'+T.new+'</span>';"
                "if(d.hd>0)return '<span class=\"hdelta up\">▲'+d.hd+'</span>';"
                "if(d.hd<0)return '<span class=\"hdelta down\">▼'+(-d.hd)+'</span>';"
                "return '<span class=\"hdelta\">→0</span>'}"
                "function avs(d){let h='';for(const x of d.srcs){"
                "h+=x.img?'<img class=\"avimg\" src=\"favicons/'+x.img+'\" title=\"'+esc(x.n)+'\" loading=\"lazy\">':'<span class=\"av\" style=\"background:hsl('+x.hue+' 65% 72%)\" title=\"'+esc(x.n)+'\">'+esc(x.ch)+'</span>'}"
                "if(d.more)h+='<span class=\"more-n\">+'+d.more+'</span>';"
                "return '<span class=\"avatars\">'+h+'</span>'}"
                "function rdHtml(d){if(d.rd===null)return '<span class=\"hdelta new\">'+T.new+'</span>';"
                "if(d.rd>0)return '<span class=\"hdelta up\">▲'+d.rd+'</span>';"
                "if(d.rd<0)return '<span class=\"hdelta down\">▼'+(-d.rd)+'</span>';"
                "return '<span class=\"hdelta\">→</span>'}"
                "function row(d){return '<div class=\"row\"><span class=\"rank'+(d.r<=3?' top':'')+'\">'+d.r+rdHtml(d)+(d.pr!==null?'<span class=\"prank\">'+T.prev+' '+d.pr+'</span>':'')+'</span>'"
                "+'<span class=\"rtitle\"><a href=\"'+d.file+'\">'+esc(d.title)+'</a>'+(d.carried?' <span class=\"note\">'+T.carried+'</span>':'')+'</span>'"
                "+'<a class=\"tag\" href=\"category-'+d.ck+'.html\">'+esc(d.cat)+'</a><span class=\"time\">'+d.time+'</span>'+avs(d)"
                "+'<span class=\"heat\"><span class=\"spark\">'+spark(d.sp)+'</span><span class=\"hv\"><b>'+d.heat+'</b> <span>'+T.wave+'</span> '+hdHtml(d)+'</span></span></div>'}"
                "let raf=0;function show(i){"
                "if(!cache[i])cache[i]=D[i].rows.map(row).join('');"
                "bd.innerHTML=cache[i];"
                "lb.textContent=D[i].label+' · '+(i===D.length-1?T.current:T.hist);"
                "ct.textContent=T.count.replace('{n}',D[i].rows.length);"
                "tk.forEach((t,j)=>t.classList.toggle('on',j===i));}"
                "sl.addEventListener('input',()=>{const i=+sl.value;"
                "cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>show(i))});"
                "tk.forEach((t,j)=>{const a=t.querySelector('a');"
                "if(a)a.addEventListener('click',e=>{e.preventDefault();sl.value=j;show(j);});});</script>")
    pager = ""
    if counts[latest_ei] > PER:
        npg = (counts[latest_ei] + PER - 1) // PER
        links = '<span class="on">1</span>' + "".join(
            f'<a href="board-{q + 1}.html">{q + 1}</a>' for q in range(1, npg))
        pager = f'<div class="pager">{links}</div>'
    body = (mast("index", editions[-len(win):], len(win) - 1, fname="index.html", tl=True)
            + slider
            + f'<section class="panel"><div class="panel-h"><span>{s("board_title")}</span>'
              f'<span class="r" id="tcount">{s("count").format(n=counts[latest_ei])}</span></div>'
              f'<div id="board">{latest_rows_html}</div></section>' + pager + heat_help() + foot() + script)
    site_ld = {"@context": "https://schema.org", "@type": "WebSite",
               "name": s("site_name"), "url": BASE_URL + lang_prefix(),
               "inLanguage": HTML_LANG[CUR["lang"]]}
    (OUT / "index.html").write_text(page(s("tabs")[0], body, path="index.html", ld=site_ld),
                                    encoding="utf-8")

    def write_paged(fname1, title, mast_key, header, chunks, per, desc=None,
                    prefix=""):
        """Write a list page as fname1 + fname1-with--N suffixes, `per`
        pre-rendered chunks per page, with a numeric pager."""
        npg = max(1, (len(chunks) + per - 1) // per)
        for p in range(npg):
            fn = fname1 if p == 0 else fname1.replace(".html", f"-{p + 1}.html")
            links = ""
            if npg > 1:
                links = '<div class="pager">' + "".join(
                    f'<span class="on">{q + 1}</span>' if q == p else
                    f'<a href="{fname1 if q == 0 else fname1.replace(".html", f"-{q + 1}.html")}">{q + 1}</a>'
                    for q in range(npg)) + "</div>"
            body = (mast(mast_key, editions, fname=fn) + prefix
                    + f'<section class="panel">{header}'
                    + "".join(chunks[p * per:(p + 1) * per]) + "</section>"
                    + links + foot())
            (OUT / fn).write_text(
                page(title if p == 0 else f"{title} · {p + 1}", body, path=fn,
                     desc=desc), encoding="utf-8")

    # seeds page: latest seeds + seed appearances of last 3 editions
    srows = []
    seed_apps = []
    for t in topics:
        for a in t["apps"]:
            if a["level"] == "seed" and a["edition"] >= latest_ei - 2:
                seed_apps.append((t, a))
    seed_apps.sort(key=lambda x: (-x[1]["edition"], -x[1]["heat"]))
    for i, (t, a) in enumerate(seed_apps, 1):
        srows.append(row_html(i, t, a, show_level=False).replace(
            '\n<span class="heat">',
            f'\n<span class="note">{ed_label(editions[a["edition"]])}</span>\n<span class="heat">'))
    sheader = (f'<div class="panel-h"><span>{s("seeds_title")}</span>'
               f'<span class="r">{s("seeds_r")}</span></div>')
    seed_cta = (f'<section class="panel"><div class="detail">'
                f'<a href="submit.html">{s("sub_cta")}</a></div></section>')
    write_paged("seeds.html", s("tabs")[2], "seeds", sheader, srows, PER,
                desc=s("desc_seeds"), prefix=seed_cta)

    # Overflow board pages (only when topics exceed one page of 100):
    # static, latest state; the slider lives on page 1.
    sts_latest = sorted(states[latest_ei].values(), key=lambda x: x["rank"])
    if len(sts_latest) > PER:
        npg = (len(sts_latest) + PER - 1) // PER
        for p in range(1, npg):
            orows = []
            for st in sts_latest[p * PER:(p + 1) * PER]:
                a = dict(st["app"])
                a["heat_delta"], a["rank_delta"] = st["heat_delta"], st["rank_delta"]
                a["carried"] = st["carried"]
                orows.append(row_html(st["rank"], st["topic"], a, show_level=True))
            links = '<a href="index.html">1</a>' + "".join(
                f'<span class="on">{q + 1}</span>' if q == p else f'<a href="board-{q + 1}.html">{q + 1}</a>'
                for q in range(1, npg))
            body = (mast("index", editions, fname=f"board-{p + 1}.html")
                    + f'<section class="panel"><div class="panel-h"><span>{s("board_title")}</span>'
                      f'<span class="r">{s("page_of").format(p=p + 1, n=npg)}</span></div>'
                    + "".join(orows) + f'</section><div class="pager">{links}</div>' + foot())
            (OUT / f"board-{p + 1}.html").write_text(
                page(f"{s('tabs')[0]} · {p + 1}", body, path=f"board-{p + 1}.html"), encoding="utf-8")

    # source stats + detail-page filenames (topic pages link to them)
    sstat = {}
    for t in topics:
        for a in t["apps"]:
            for src in a["sources"]:
                e = sstat.setdefault(src, {"apps": 0, "topics": {}, "last_ei": -1,
                                           "first_ei": 10 ** 9, "eds": set(),
                                           "topic_apps": {}, "topic_last": {}})
                e["apps"] += 1
                e["topics"][t["slug"]] = t
                e["last_ei"] = max(e["last_ei"], a["edition"])
                e["first_ei"] = min(e["first_ei"], a["edition"])
                e["eds"].add(a["edition"])
                e["topic_apps"][t["slug"]] = e["topic_apps"].get(t["slug"], 0) + 1
                e["topic_last"][t["slug"]] = max(
                    e["topic_last"].get(t["slug"], -1), a["edition"])
    SRC_FILES = {}
    _used_src = set(RESERVED_FILES)
    for src in sstat:
        base = "source-" + slugify(src, "src")
        fn, n = base + ".html", 2
        while fn in _used_src:
            fn, n = f"{base}-{n}.html", n + 1
        _used_src.add(fn)
        SRC_FILES[src] = fn

    def src_href(src):
        return quote(SRC_FILES[src], safe="-._~") if src in SRC_FILES else None

    def src_link(x):
        h = src_href(x)
        return f'<a href="{h}">{html.escape(x)}</a>' if h else html.escape(x)

    # topic pages
    for t in topics:
        last = t["apps"][-1]
        last_disp = dict(last)
        last_disp["rank_delta"] = last["board_rank_delta"]
        emoji = LEVELS.get(last["level"], LEVELS["seed"])[0]
        label = level_label(last["level"])
        t_url = f"{BASE_URL}{lang_prefix()}{topic_href(t)}"
        share = share_links(t_url, f"{t['name']} · {s('wave')} {last['heat']}｜{s('pg_title')}")
        hist_rows = ""
        for a in t["apps"]:
            if a["heat_delta"] is None:
                chg = s("first")
            else:
                rd = a["board_rank_delta"] or 0
                chg = (f"{s('wave')} {'+' if a['heat_delta'] > 0 else ''}{a['heat_delta']} · "
                       f"{s('rank')} {'▲' + str(rd) if rd > 0 else '▼' + str(-rd) if rd < 0 else '→'}")
            src_txt = "、".join(src_link(x) for x in a["sources"])
            lnk = " · ".join(
                f'<a href="{html.escape(l, quote=True)}" rel="nofollow noopener" target="_blank">'
                f'{html.escape(urlparse(l).netloc or "原文")}</a>'
                for l in a["links"]) or "—"
            hist_rows += (f'<tr><td>{ed_label(editions[a["edition"]])}</td><td class="n">{a["heat"]}</td>'
                          f'<td class="n">#{a["board_rank"]}</td><td>{LEVELS.get(a["level"], LEVELS["seed"])[0]}{LEVELS.get(a["level"], LEVELS["seed"])[1]}</td>'
                          f'<td>{chg}</td><td>{html.escape(a["title"])}</td>'
                          f'<td>{src_txt}</td><td>{lnk}</td></tr>')
        links = last["links"]
        det = ""
        if links:
            lis = "".join(f'<li><a href="{html.escape(u)}" rel="nofollow noopener">{html.escape(u)}</a></li>' for u in links)
            det = (f'<div class="orig"><div class="note">{s("orig_links")} ({len(links)})</div>'
                   f'<ul>{lis}</ul></div>')
        body_html = html.escape(last["body"]).replace("\n", "<br>")
        act = f'<p><b>{s("action")}</b>：{html.escape(last["action"])}</p>' if last["action"] else ""
        # creator reference v2: frameworks distilled from public writing
        # skills (tweet-writer hook formulas + PAS; Hormozi's four parts;
        # Dan Koe's rhythm), filled with this topic's own data
        hook = re.split(r"(?<=[。！？.!?])\s*", (last["body"] or "").strip(),
                        maxsplit=1)[0][:90]
        all_srcs = sorted({x for a in t["apps"] for x in a["sources"]})
        doms = []
        for a in t["apps"]:
            for u in a["links"]:
                d = urlparse(u).netloc
                if d and d not in doms:
                    doms.append(d)
        src_line = " · ".join(doms) if doms else "—"
        data_line = (s("wave_rank").format(h=last["heat"], r=last["board_rank"])
                     + " · " + s("resonance").format(n=len(all_srcs)))
        ht = HOOK_T[CUR["lang"]]
        hooks = [("hk_num", ht["num"].format(name=t["name"], heat=last["heat"],
                                             n=len(all_srcs))),
                 ("hk_gap", ht["gap"].format(hook=hook)),
                 ("hk_signal", ht["signal"].format(name=t["name"],
                                                   rank=last["board_rank"]))]
        hooks_ol = ('<ol class="ol-list">' + "".join(
            f'<li><b>{s(k)}</b>：{html.escape(v)}</li>' for k, v in hooks) + "</ol>")
        pas_ol = ('<ol class="ol-list">'
                  f'<li><b>{s("pas_p")}</b>：{html.escape(hook)}</li>'
                  + (f'<li><b>{s("pas_a")}</b>：{html.escape(last["action"])}</li>'
                     if last["action"] else "")
                  + f'<li><b>{s("pas_s")}</b>：{body_html}<br>{data_line} · '
                    f'{s("ol_src")}：{html.escape(src_line)}</li></ol>')
        traj = " → ".join(str(a["heat"]) for a in t["apps"])
        hz_ol = ('<ol class="ol-list">'
                 f'<li><b>{s("hz1")}</b>：{s("hz1_hint")}</li>'
                 f'<li><b>{s("hz2")}</b>：{html.escape(t["apps"][0]["title"])} → '
                 f'{html.escape(last["title"])}（{s("traj")}：{traj}）</li>'
                 f'<li><b>{s("hz3")}</b>：{s("hz3_hint")}</li>'
                 f'<li><b>{s("hz4")}</b>：{s("hz4_txt")}</li></ol>')
        st_ul = "".join(f"<li>{html.escape(x)}</li>" for x in SHORT_TIPS[CUR["lang"]])
        lt_ul = "".join(f"<li>{html.escape(x)}</li>" for x in LONG_TIPS[CUR["lang"]])
        creator = (f'<section class="panel"><div class="panel-h"><span>{s("creator_title")}</span>'
                   f'<span class="r">{s("cr_src")}</span></div>'
                   f'<div class="subh">{s("ol_short")}</div>'
                   f'<div class="note" style="margin-top:8px">{s("cr_hooks")}</div>{hooks_ol}'
                   f'<div class="note" style="margin-top:10px">{s("cr_pas")}</div>{pas_ol}'
                   f'<div class="subh">{s("tips_s")}</div><ul class="tips">{st_ul}</ul>'
                   f'<div class="subh">{s("ol_long")}</div>'
                   f'<div class="note" style="margin-top:8px">{s("cr_hz")}</div>{hz_ol}'
                   f'<div class="subh">{s("tips_l")}</div><ul class="tips">{lt_ul}</ul></section>')
        ths = s("th")
        thead = (f'<th>{ths[0]}</th><th class="n">{ths[1]}</th><th class="n">{ths[2]}</th>'
                 + "".join(f'<th>{x}</th>' for x in ths[3:]))
        body = (mast("", editions, fname=topic_file(t))
                + f'<section class="panel"><div class="panel-h"><span>{html.escape(t["name"])}</span>'
                  f'<span><a class="tag" href="{cat_file(last["category"])}">{html.escape(cat_name(last["category"]))}</a> '
                  f'<a class="badge" href="level-{last["level"]}.html">{emoji} {label}</a></span></div>'
                  f'<div style="display:flex;gap:26px;align-items:flex-end;padding:6px 0 2px">'
                  f'<div><div class="big-heat">{last["heat"]}</div><div class="note">{s("cur_wave")}</div></div>'
                  f'<div><div style="font-family:var(--mono);font-size:26px;font-weight:700">#{last["board_rank"]}</div>'
                  f'<div class="note">{s("board_rank")} ({ed_label(editions[last["edition"]])})</div></div>'
                  f'<div class="deltas">{delta_chips(last_disp)}</div></div>'
                  f'<div class="share"><span class="note">{s("share")}</span>{share}</div>'
                  f'{heat_help()}'
                  f'<h3 style="margin:26px 0 6px">{s("chart")}</h3>{wave_chart(t, editions)}'
                  f'<table><tr>{thead}</tr>{hist_rows}</table>'
                  f'<div class="detail" style="margin-top:24px"><p>{body_html}</p>{act}'
                  f'{det}</div></section>'
                + (creator if CREATOR else "") + foot())
        ld = {"@context": "https://schema.org", "@type": "NewsArticle",
              "headline": last["title"], "description": (last["body"] or "")[:150],
              "datePublished": t["apps"][0].get("published"),
              "dateModified": last.get("published"),
              "author": {"@type": "Person", "name": "Dai", "url": "https://x.com/daiyanze"},
              "publisher": {"@type": "Organization", "name": s("site_name"), "url": BASE_URL},
              "mainEntityOfPage": t_url}
        (OUT / topic_file(t)).write_text(
            page(t["name"], body, desc=(last["body"] or "")[:110],
                 path=topic_file(t), ld=ld), encoding="utf-8")
        (OUT / f"topic-{t['id']}.html").write_text(
            '<!DOCTYPE html><html><head><meta charset="utf-8">'
            f'<meta http-equiv="refresh" content="0; url={topic_href(t)}">'
            f'<link rel="canonical" href="{t_url}"><meta name="robots" content="noindex">'
            f'<title>{html.escape(t["name"])}</title></head>'
            f'<body><a href="{topic_href(t)}">{html.escape(t["name"])}</a></body></html>',
            encoding="utf-8")

    # edition snapshots
    for ei, ed in enumerate(editions):
        erows = []
        items = sorted(ed["items"], key=lambda x: -x["_heat"])
        for i, it in enumerate(items, 1):
            t, a = tmap[(ei, it["title"])]
            erows.append(row_html(i, t, a, show_level=True))
        body = (mast("", editions, fname=ed_file(ed))
                + f'<section class="panel"><div class="panel-h"><span>{s("snap_title").format(x=ed_label(ed))}</span>'
                  f'<span class="r">{s("count").format(n=len(items))}</span></div>'
                + "".join(erows) + "</section>" + foot())
        (OUT / ed_file(ed)).write_text(
            page(f"{ed_label(ed)} · {s('tabs')[0]}", body, path=ed_file(ed)), encoding="utf-8")

    def state_row(st, rank=None, show_level=True):
        a = dict(st["app"])
        a["heat_delta"], a["rank_delta"] = st["heat_delta"], st["rank_delta"]
        a["carried"] = st["carried"]
        return row_html(rank if rank is not None else st["rank"], st["topic"], a,
                        show_level=show_level)

    # rising: 涨潮榜 — 浪高 gain vs the previous board state. A topic that is
    # new at the latest time point counts its full 浪高 as the gain (it rose
    # from nothing); if nothing rose, an explicit empty note is rendered.
    def eff_gain(st):
        return st["heat_delta"] if st["heat_delta"] is not None else st["app"]["heat"]

    rising = [st for st in sts_latest if eff_gain(st) > 0]
    rising.sort(key=lambda x: -eff_gain(x))
    rchunks = [state_row(st, i) for i, st in enumerate(rising, 1)] or \
        [f'<p class="note">{s("rising_empty")}</p>']
    rheader = (f'<div class="panel-h"><span>{s("rising_title")}</span>'
               f'<span class="r">{ed_label(latest)} · '
               f'{s("rising_r").format(n=len(rising))}</span></div>')
    write_paged("rising.html", s("tabs")[1], "rising", rheader, rchunks, PER,
                desc=s("desc_rising"), prefix=heat_help())

    # categories & levels: tag index page + one page per category / level
    cat_order = [c for c, _ in CAT_RULES] + ["行业动态"]
    cat_sts = {cat: [st for st in sts_latest if st["app"]["category"] == cat]
               for cat in cat_order}
    lv_sts = {lv: [st for st in sts_latest if st["app"]["level"] == lv]
              for lv in ("must", "watch", "seed")}
    def tag_index(active=None):
        """The tag group (all category + level chips). Shown on the categories
        page and on every tag page; the focused tag is highlighted."""
        chips = "".join(
            f'<a class="tagchip{" on" if active == f"cat:{cat}" else ""}" href="{cat_file(cat)}">{html.escape(cat_name(cat))} · {len(cat_sts[cat])}</a>'
            for cat in cat_order if cat_sts[cat])
        chips += "".join(
            f'<a class="tagchip{" on" if active == f"lv:{lv}" else ""}" href="level-{lv}.html">{LEVELS[lv][0]}{level_label(lv)} · {len(lv_sts[lv])}</a>'
            for lv in ("must", "watch", "seed") if lv_sts[lv])
        return (f'<section class="panel"><div class="panel-h"><span>{s("tags_title")}</span></div>'
                f'<div class="tagchips">{chips}</div></section>')

    cat_sections = ""
    for cat in cat_order:
        sts = cat_sts[cat]
        if not sts:
            continue
        crows = "".join(state_row(st) for st in sts)
        cat_sections += (f'<section class="panel"><div class="panel-h"><span><a href="{cat_file(cat)}">{html.escape(cat_name(cat))}</a></span>'
                         f'<span class="r">{s("cat_r").format(n=len(sts))}</span></div>{crows}</section>')
        cheader = (f'<div class="panel-h"><span>{html.escape(cat_name(cat))}</span>'
                   f'<span class="r">{s("cat_r").format(n=len(sts))}</span></div>')
        write_paged(cat_file(cat), cat_name(cat), "categories", cheader,
                    [state_row(st) for st in sts], PER,
                    prefix=tag_index(f"cat:{cat}"))
    for lv in ("must", "watch", "seed"):
        sts = lv_sts[lv]
        if not sts:
            continue
        ltitle = f"{LEVELS[lv][0]} {level_label(lv)}"
        lheader = (f'<div class="panel-h"><span>{ltitle}</span>'
                   f'<span class="r">{s("cat_r").format(n=len(sts))}</span></div>')
        write_paged(f"level-{lv}.html", ltitle, "categories", lheader,
                    [state_row(st) for st in sts], PER,
                    prefix=tag_index(f"lv:{lv}"))
    body = mast("categories", editions, fname="categories.html") + tag_index() + cat_sections + foot()
    (OUT / "categories.html").write_text(page(s("tabs")[3], body, path="categories.html"), encoding="utf-8")

    # archive: grouped by date; editions within a date ordered by time
    by_date = {}
    for ed in editions:
        by_date.setdefault(ed["date"], []).append(ed)
    date_blocks = []
    for date in sorted(by_date, reverse=True):
        eds = sorted(by_date[date], key=lambda e: e.get("published_at") or "", reverse=True)
        block = (f'<div class="panel-h" style="margin-top:16px"><span>{date}</span>'
                 f'<span class="r">{s("editions_n").format(n=len(eds))}</span></div>')
        for ed in eds:
            top = max(ed["items"], key=lambda x: x["_heat"])
            tim = (ed.get("published_at") or "")[11:16]
            block += (f'<div class="row"><span class="time">{tim}</span>'
                      f'<span class="rtitle"><a href="{ed_file(ed)}">'
                      f'{SLOT.get(ed.get("slot"), (ed.get("slot") or "", 0))[0]} · '
                      f'{html.escape(ed.get("title") or "")}</a></span>'
                      f'<span class="note">{s("archive_row").format(n=len(ed["items"]))}{html.escape(top["title"][:30])}</span>'
                      f'<span class="heat"><span class="hv"><b>{top["_heat"]}</b> <span>{s("wave")}</span></span></span></div>')
        date_blocks.append(block)
    aheader = (f'<div class="panel-h"><span>{s("archive_title")}</span>'
               f'<span class="r">{s("archive_r").format(n=len(editions))}</span></div>')
    write_paged("archive.html", s("tabs")[6], "archive", aheader, date_blocks,
                ARCHIVE_DAYS)

    # sources list (sstat was computed before the topic pages)
    schunks = []
    blocks = load_config_blocks()
    for src, e in sorted(sstat.items(), key=lambda kv: (-kv[1]["apps"], kv[0])):
        dom = SOURCE_DOMAINS.get(src)
        if dom and dom in FAV_FILES:
            icon = f'<img class="avimg src-ic" src="favicons/{FAV_FILES[dom]}" alt="">'
        else:
            hue = sum(ord(c) for c in src) % 360
            icon = (f'<span class="av src-ic" style="background:hsl({hue} 65% 72%);margin-left:0">'
                    f'{html.escape(next((c for c in src if c.isalnum()), src[:1]))}</span>')
        name_html = (f'<a href="{src_href(src)}">{html.escape(src)}</a>'
                     + (f' <a href="https://{dom}" rel="noopener" class="note">↗</a>'
                        if dom else ""))
        tops = sorted(e["topics"].values(), key=lambda x: -x["apps"][-1]["heat"])
        tlinks = " · ".join(
            f'<a href="{topic_href(x)}">{html.escape(x["name"][:22])}</a>' for x in tops)
        stats = s("src_stats").format(
            dom=dom or "—", a=len(e["topics"]), b=e["apps"], c=len(e["eds"]),
            d=ed_label(editions[e["first_ei"]]), e=ed_label(editions[e["last_ei"]]))
        blk = source_block(src, blocks)
        cfg_html = (f'<details class="cfgdet"><summary>⚙️ config · {source_key(src)}</summary>'
                    f'<pre class="cfgpre">{html.escape(blk)}</pre></details>') if blk else ""
        schunks.append(f'<div class="row">{icon}'
                       f'<span class="rtitle">{name_html}</span>'
                       f'<span class="note">{html.escape(stats)}</span></div>'
                       + cfg_html
                       + f'<div class="srctops" style="padding:0 0 10px 43px">{tlinks}</div>')
    srcheader = (f'<div class="panel-h"><span>{s("sources_title")}</span>'
                 f'<span class="r">{s("sources_r").format(n=len(sstat))}</span></div>')
    write_paged("sources.html", s("tabs")[4], "sources", srcheader, schunks,
                SOURCES_PER, desc=s("desc_sources"))

    # one detail page per source: stats, verbatim config, contributed topics
    for src, e in sorted(sstat.items(), key=lambda kv: (-kv[1]["apps"], kv[0])):
        dom = SOURCE_DOMAINS.get(src)
        if dom and dom in FAV_FILES:
            icon = f'<img class="avimg src-ic" src="favicons/{FAV_FILES[dom]}" alt="">'
        else:
            hue = sum(ord(c) for c in src) % 360
            icon = (f'<span class="av src-ic" style="background:hsl({hue} 65% 72%);margin-left:0">'
                    f'{html.escape(next((c for c in src if c.isalnum()), src[:1]))}</span>')
        stats = s("src_stats").format(
            dom=dom or "—", a=len(e["topics"]), b=e["apps"], c=len(e["eds"]),
            d=ed_label(editions[e["first_ei"]]), e=ed_label(editions[e["last_ei"]]))
        tops_sorted = sorted(e["topics"].values(), key=lambda x: -x["apps"][-1]["heat"])
        trows = ""
        for i, x in enumerate(tops_sorted, 1):
            xa = x["apps"][-1]
            trows += (f'<div class="row"><span class="rank">{i}</span>'
                      f'<span class="rtitle"><a href="{topic_href(x)}">{html.escape(x["name"])}</a></span>'
                      f'<a class="tag" href="{cat_file(xa["category"])}">{html.escape(cat_name(xa["category"]))}</a>'
                      f'<span class="note">{s("src_topic_meta").format(n=e["topic_apps"][x["slug"]], d=ed_label(editions[e["topic_last"][x["slug"]]]))}</span>'
                      f'<span class="heat"><span class="hv"><b>{xa["heat"]}</b> <span>{s("wave")}</span></span></span></div>')
        blk = source_block(src, blocks)
        cfg_panel = (f'<section class="panel"><div class="panel-h"><span>{s("cfg_title")}</span></div>'
                     f'<pre class="cfgpre full">{html.escape(blk)}</pre></section>') if blk else ""
        dbody = (mast("sources", editions, fname=SRC_FILES[src])
                 + f'<section class="panel"><div class="panel-h"><span>{icon} {html.escape(src)}</span>'
                 + (f'<span><a href="https://{dom}" rel="noopener">{html.escape(dom)} ↗</a></span>'
                    if dom else "")
                 + f'</div><p class="note">{html.escape(stats)}</p></section>'
                 + cfg_panel
                 + f'<section class="panel"><div class="panel-h"><span>{s("src_topics_title")}</span>'
                   f'<span class="r">{s("count").format(n=len(tops_sorted))}</span></div>'
                 + trows + "</section>" + foot())
        (OUT / SRC_FILES[src]).write_text(
            page(src, dbody, path=SRC_FILES[src], desc=stats), encoding="utf-8")

    # about: site explanation (the old footer text lives here now)
    body = mast("about", editions, fname="about.html") + ABOUT[CUR["lang"]] + foot()
    about_ld = {"@context": "https://schema.org", "@type": "AboutPage",
                "name": f"{s('tabs')[7]} · {s('site_name')}",
                "url": BASE_URL + lang_prefix() + "about.html",
                "author": {"@type": "Person", "name": "Dai", "url": "https://x.com/daiyanze"}}
    (OUT / "about.html").write_text(page(s("tabs")[7], body, path="about.html",
                                    desc=s("desc_about"),
                                    ld=about_ld), encoding="utf-8")

    # track record (E1): generated from track-record.md at build time —
    # the Markdown ledger stays the human-maintained source of truth.
    tr = parse_track_record()
    if tr["reviewed"]:
        rate = tr["hits"] / tr["reviewed"] * 100 if tr["reviewed"] else 0
        tr_summary = (f'{s("tr_reviewed")} {tr["reviewed"]} · '
                      f'{s("tr_hit_rate")} {rate:.0f}%')
    else:
        tr_summary = s("tr_first_review").format(d=tr["first_review"])
    tr_groups = ""
    for g in tr["groups"]:
        rows = ""
        for en in g["entries"]:
            lv = LEVEL_I18N.get(en["level"], LEVEL_I18N["seed"])[CUR["lang"]]
            res = html.escape(en["result"]) if en["result"] else s("tr_pending")
            rows += (f'<tr class="tr-row"><td>{en["emoji"]} {lv}</td>'
                     f'<td>{html.escape(en["topic"])}</td>'
                     f'<td>{html.escape(en["criteria"])}</td>'
                     f'<td class="n">{en["review_date"]}</td><td>{res}</td></tr>')
        ths = s("tr_th")
        thead = "".join(f'<th>{x}</th>' for x in ths)
        tr_groups += (f'<section class="panel"><div class="panel-h">'
                      f'<span>{g["date"]} {html.escape(g["label"])}</span>'
                      f'<span class="r">{ths[3]} {g["review_date"]}</span></div>'
                      f'<table><tr>{thead}</tr>{rows}</table></section>')
    tr_body = (mast("track", editions, fname="track-record.html")
               + f'<section class="panel"><div class="panel-h"><span>{s("tr_title")}</span>'
                 f'<span class="r">{s("tr_total")} {tr["total"]} · '
                 f'{s("tr_reviewed")} {tr["reviewed"]}</span></div>'
                 f'<div class="detail"><p>{s("tr_intro")}</p>'
                 f'<p><b>{tr_summary}</b></p>'
                 f'<h3 style="margin:16px 0 6px">{s("tr_criteria_t")}</h3>'
                 f'{s("tr_criteria")}</div></section>'
               + tr_groups + foot())
    (OUT / "track-record.html").write_text(
        page(s("tabs")[5], tr_body, path="track-record.html",
             desc=s("desc_track")), encoding="utf-8")

    # submit a seed (A4): GitHub Issue link with prefilled fields, plus a
    # bookmarklet that lands here with ?title=&url=; the inline script
    # renders those into the same 标题/链接/理由 text block the extension
    # exports.
    issue_body = quote("标题：\n链接：\n理由：\n", safe="")
    issue_url = ("https://github.com/daiyanze/breaker-delta/issues/new"
                 f"?template=seed.md&title={quote('🌱 投苗：', safe='')}"
                 f"&body={issue_body}")
    submit_abs = f"{BASE_URL}{lang_prefix()}submit.html"
    bookmarklet = ("javascript:(function(){var t=document.title||'';"
                   "window.open('" + submit_abs + "?title='+encodeURIComponent(t)"
                   "+'&url='+encodeURIComponent(location.href),'_blank');})();")
    seed_script = ("<script>(function(){var p=new URLSearchParams(location.search);"
                   "var t=p.get('title')||'',u=p.get('url')||'';"
                   "if(t||u){document.getElementById('seedtext').value="
                   "'标题：'+t+'\\n链接：'+u+'\\n理由：';}})();</script>")
    sub_body = (mast("", editions, fname="submit.html")
                + f'<section class="panel"><div class="panel-h"><span>{s("sub_title")}</span></div>'
                  f'<div class="detail"><p>{s("sub_intro")}</p>'
                  f'<h3 style="margin:16px 0 6px">{s("sub_good_t")}</h3>{s("sub_good")}'
                  f'<h3 style="margin:16px 0 6px">{s("sub_issue_t")}</h3>'
                  f'<p><a href="{issue_url}" rel="noopener">{s("sub_issue_btn")}</a></p>'
                  f'<p>{s("sub_issue_note")}</p>'
                  f'<h3 style="margin:16px 0 6px">{s("sub_bm_t")}</h3>'
                  f'<p><a href="{html.escape(bookmarklet, quote=True)}">{s("sub_bm_btn")}</a></p>'
                  f'<p>{s("sub_bm_note")}</p>'
                  f'<h3 style="margin:16px 0 6px">{s("sub_prefill_t")}</h3>'
                  f'<textarea id="seedtext" rows="4" readonly '
                  f'style="width:100%;font-family:var(--mono);font-size:13px">'
                  f'标题：\n链接：\n理由：</textarea>'
                  f'</div></section>' + foot() + seed_script)
    (OUT / "submit.html").write_text(
        page(s("sub_title"), sub_body, path="submit.html",
             desc=s("desc_submit")), encoding="utf-8")

    # RSS + Atom from the latest board (top 30 topics)
    def xesc(s):
        return html.escape(s or "", quote=True)

    items_xml, entries_xml = "", ""
    for st in sts_latest[:30]:
        a, t = st["app"], st["topic"]
        link = f"{BASE_URL}{lang_prefix()}{topic_href(t)}"
        pub = a.get("published") or ""
        try:
            rfc = email.utils.format_datetime(datetime.fromisoformat(pub))
        except Exception:
            rfc, pub = "", ""
        desc = xesc((a["body"] or "")[:280])
        items_xml += (f"<item><title>{xesc(a['title'])}</title><link>{link}</link>"
                      f"<guid>{link}</guid><pubDate>{rfc}</pubDate>"
                      f"<description>{desc}</description></item>")
        entries_xml += (f"<entry><title>{xesc(a['title'])}</title>"
                        f"<link href=\"{link}\"/><id>{link}</id>"
                        f"<updated>{pub}</updated><summary>{desc}</summary></entry>")
    latest_pub = max((a.get("published") or "" for t in topics for a in t["apps"]), default="")
    rss = (f'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
           f"<title>{xesc(s('site_name'))}</title><link>{BASE_URL}{lang_prefix()}</link>"
           f"<description>{xesc(s('desc_default'))}</description>{items_xml}</channel></rss>")
    atom = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<feed xmlns="http://www.w3.org/2005/Atom"><title>{xesc(s("site_name"))}</title>'
            f"<link href=\"{BASE_URL}{lang_prefix()}\"/><id>{BASE_URL}{lang_prefix()}</id>"
            f"<updated>{latest_pub}</updated>{entries_xml}</feed>")
    (OUT / "feed.xml").write_text(rss, encoding="utf-8")
    (OUT / "atom.xml").write_text(atom, encoding="utf-8")

    print("pages:", len(list(OUT.glob("*.html"))), "| topics:", len(topics),
          "| latest top heat:", max(it["_heat"] for it in latest["items"]))


if __name__ == "__main__":
    main()
