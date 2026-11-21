/**
 * Launch source list (M0-07). One entry per fetch group.
 *
 * A fetch group is the unit of "independent source": a wave needs echoes from
 * at least `waveThreshold` different groups. A bundle group (`countsAsOne`)
 * counts as one source however many of its members report a story.
 *
 * Only sources that are free and uncontested to read are listed. Left out on
 * purpose, see `SKIPPED_GROUPS`. Reachability is not confirmed yet: spike 2
 * (docs/spikes/m0.md) probes every `probeUrl` from both networks.
 */

export type SourceTier = "first_hand" | "relaying";

export interface LaunchGroup {
  id: string;
  name: string;
  /** first_hand: where things appear first. relaying: where they spread. */
  tier: SourceTier;
  /** True for bundles: the whole group is one independent source. */
  countsAsOne: boolean;
  /** 0 = every run. 1440 = at most once a day. */
  minIntervalMinutes: number;
  /** One representative URL, used by the reachability probe. */
  probeUrl: string;
  /** Feed URLs of a bundle group. */
  members?: readonly string[];
}

export const LAUNCH_GROUPS: readonly LaunchGroup[] = [
  {
    id: "official_blogs",
    name: "Official blogs",
    tier: "first_hand",
    countsAsOne: true,
    minIntervalMinutes: 0,
    probeUrl: "https://openai.com/news/rss.xml",
    members: [
      "https://openai.com/news/rss.xml",
      "https://deepmind.google/blog/rss.xml",
      "https://research.google/blog/rss/",
      "https://huggingface.co/blog/feed.xml",
      "https://mistral.ai/news/rss",
      "https://blogs.nvidia.com/feed/",
      "https://aws.amazon.com/blogs/machine-learning/feed/",
      "https://github.blog/ai-and-ml/feed/",
      "https://www.microsoft.com/en-us/research/feed/",
      "https://bair.berkeley.edu/blog/feed.xml",
      "https://blog.langchain.com/rss.xml",
      "https://blog.google/rss/",
      "https://ollama.com/blog/rss.xml",
      "https://www.databricks.com/feed",
      "https://blog.cloudflare.com/rss/",
      "https://github.blog/changelog/feed/",
      "https://blog.mozilla.org/en/feed/",
    ],
  },
  {
    id: "github",
    name: "GitHub breakout repositories",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://api.github.com/search/repositories?q=stars:%3E500&sort=updated&per_page=1",
  },
  {
    id: "hackernews",
    name: "Hacker News front page and Show HN",
    tier: "first_hand",
    countsAsOne: true,
    minIntervalMinutes: 0,
    probeUrl: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=1",
    members: [
      "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
      "https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=30",
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face trending models",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=1",
  },
  {
    id: "hf_spaces",
    name: "Hugging Face trending Spaces",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=1",
  },
  {
    id: "openrouter",
    name: "OpenRouter new models",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://openrouter.ai/api/v1/models",
  },
  {
    id: "arxiv",
    name: "arXiv cs.AI, cs.CL, cs.LG",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 1440,
    probeUrl: "https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1",
  },
  {
    id: "daily_papers",
    name: "Hugging Face Daily Papers",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 1440,
    probeUrl: "https://huggingface.co/api/daily_papers?limit=1",
  },
  {
    id: "producthunt",
    name: "Product Hunt public feed",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://www.producthunt.com/feed",
  },
  {
    id: "gh_releases",
    name: "GitHub releases watch list",
    tier: "first_hand",
    countsAsOne: true,
    minIntervalMinutes: 0,
    probeUrl: "https://github.com/ggml-org/llama.cpp/releases.atom",
    members: [
      "https://github.com/ggml-org/llama.cpp/releases.atom",
      "https://github.com/vllm-project/vllm/releases.atom",
      "https://github.com/anthropics/claude-code/releases.atom",
    ],
  },
  {
    id: "federal_register",
    name: "US Federal Register",
    tier: "first_hand",
    countsAsOne: false,
    minIntervalMinutes: 1440,
    probeUrl: "https://www.federalregister.gov/api/v1/documents.json?per_page=1",
  },
  {
    id: "bluesky",
    name: "Bluesky key accounts",
    tier: "first_hand",
    countsAsOne: true,
    minIntervalMinutes: 0,
    probeUrl: "https://bsky.app/profile/simonwillison.net/rss",
    members: [
      "https://bsky.app/profile/simonwillison.net/rss",
      "https://bsky.app/profile/karpathy.bsky.social/rss",
      "https://bsky.app/profile/gdb.bsky.social/rss",
      "https://bsky.app/profile/techcrunch.com/rss",
      "https://bsky.app/profile/theverge.com/rss",
      "https://bsky.app/profile/wired.com/rss",
      "https://bsky.app/profile/arstechnica.com/rss",
    ],
  },
  {
    id: "tech_media",
    name: "Tech media and independent authors",
    tier: "relaying",
    countsAsOne: true,
    minIntervalMinutes: 0,
    probeUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    members: [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
      "https://arstechnica.com/ai/feed/",
      "https://www.technologyreview.com/topic/artificial-intelligence/feed",
      "https://the-decoder.com/feed/",
      "https://simonwillison.net/atom/everything/",
      "https://importai.substack.com/feed",
      "https://www.latent.space/feed",
      "https://www.interconnects.ai/feed",
      "https://magazine.sebastianraschka.com/feed",
      "https://www.dwarkesh.com/feed",
      "https://semianalysis.substack.com/feed",
      "https://www.oneusefulthing.org/feed",
      "https://www.platformer.news/feed",
      "https://www.ycombinator.com/blog/feed",
      "https://www.lesswrong.com/feed.xml",
    ],
  },
  {
    id: "devto",
    name: "DEV.to top posts",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://dev.to/api/articles?top=1&per_page=1",
  },
  {
    id: "lobsters",
    name: "Lobsters hottest",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://lobste.rs/hottest.json",
  },
  {
    id: "stackexchange",
    name: "Stack Exchange hot questions",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://stackexchange.com/feeds/questions",
  },
  {
    id: "mastodon",
    name: "Mastodon trending links",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://mastodon.social/api/v1/trends/links?limit=1",
  },
  {
    id: "wikipedia",
    name: "Wikipedia most read",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 1440,
    probeUrl:
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/11/19",
  },
  {
    id: "app_store",
    name: "App Store charts",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 1440,
    probeUrl: "https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json",
  },
  {
    id: "google_news",
    name: "Google News, tech and AI topics",
    tier: "relaying",
    countsAsOne: false,
    minIntervalMinutes: 0,
    probeUrl: "https://news.google.com/rss/search?q=AI&hl=en-US&gl=US&ceid=US:en",
  },
];

/** Groups the previous version read that are not carried over, and why. */
export const SKIPPED_GROUPS: readonly { id: string; reason: string }[] = [
  { id: "x", reason: "Needs a paid API." },
  { id: "reddit", reason: "Reading without an approved API key is contested." },
  { id: "google_trends", reason: "No free official API. Verification uses Wikipedia pageviews." },
  { id: "civitai", reason: "Owner decision: too far from news." },
  { id: "sitemaps", reason: "Owner decision: too far from news." },
  { id: "show_hn", reason: "Merged into hackernews so one post cannot count as two sources." },
];
