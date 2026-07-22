import type { DemoRun } from '../lib/demo'

/**
 * Frozen demo run - REAL data, regenerated 2026-07-03 after the link-quality
 * overhaul. Internal picks come from running zapier.com's live blog sitemap
 * (4,212 URLs, real <lastmod>) through the actual scoring pipeline; external
 * picks are the top-ranking editorial pages for each topic (Ahrefs
 * serp-overview), scored domain-level via batch-analysis exactly like the live
 * enrichExternal path. Every URL health-checked 200 OK on the generation date.
 * No keys, no API calls at runtime: this replays so anyone can see the tool
 * work instantly.
 *
 * Scenario: an article on topical authority, sourcing links for zapier.com.
 * Note the new behaviour on display: externals are one-per-site (registrable
 * domain), two per topic, zero homepages; internals are editorial blog posts
 * only - topic buckets that held only junk were skipped (quality > balance).
 */
export const demoRun: DemoRun = {
  domain: 'zapier.com',
  articleTitle: 'How topical authority actually compounds',
  articleExcerpt:
    'Content clusters, pillar pages, and the internal-linking discipline that turns a pile of posts into a topic you own.',
  articleText: `Topical authority is not a single article ranking. It is the compounding effect of covering a subject so thoroughly, and linking it together so deliberately, that search engines treat your site as a primary source on it.

This piece walks through how content clusters and pillar pages structure that coverage, why internal linking is the connective tissue that makes a cluster legible to crawlers, and how a disciplined content strategy turns a scattered blog into a topic you actually own. The goal is not more posts. It is depth, structure, and the kind of internal linking that signals expertise.`,
  topics: ['topical authority', 'content clusters', 'pillar pages', 'internal linking', 'content strategy'],

  // Internal: real zapier.com/blog articles picked by the live scoring code
  // from the site's actual sitemap (word-level topic match + content-section
  // boost + <lastmod> recency). Titles are the real page titles; dates are
  // the sitemap's real lastmod values.
  internal: [
    { url: 'https://zapier.com/blog/customer-acquisition-strategy/', kind: 'internal', title: '13 proven customer acquisition strategy examples', sourceTopic: 'content strategy', date: '2026-07-02' },
    { url: 'https://zapier.com/blog/content-calendar-template/', kind: 'internal', title: '4 free content calendar templates + tips', sourceTopic: 'content clusters', date: '2025-09-18' },
    { url: 'https://zapier.com/blog/best-seo-content-optimization-tools/', kind: 'internal', title: 'The 4 best content optimization tools', sourceTopic: 'content clusters', date: '2025-08-06' },
    { url: 'https://zapier.com/blog/ai-for-content-research/', kind: 'internal', title: 'Why I combine AI tools for content research', sourceTopic: 'content clusters', date: '2025-02-10' },
    { url: 'https://zapier.com/blog/content-marketing-trends/', kind: 'internal', title: '10+ content marketing trends to expect in 2025', sourceTopic: 'content clusters', date: '2025-01-13' },
    { url: 'https://zapier.com/blog/content-marketing-tools/', kind: 'internal', title: 'The 8 best content marketing tools', sourceTopic: 'content clusters', date: '2024-11-04' },
    { url: 'https://zapier.com/blog/content-marketing-workflow/', kind: 'internal', title: 'The content creation workflow: 4-step guide', sourceTopic: 'content clusters', date: '2024-10-15' },
    { url: 'https://zapier.com/blog/gated-content-best-practices/', kind: 'internal', title: 'What is gated content? Examples and best practices', sourceTopic: 'content clusters', date: '2025-04-10' },
    { url: 'https://zapier.com/blog/speed-up-content-production-with-ai/', kind: 'internal', title: 'Speed up content production with AI & automation', sourceTopic: 'content clusters', date: '2024-11-21' },
    { url: 'https://zapier.com/blog/social-media-strategy/', kind: 'internal', title: 'Social media strategy guide + template [2025]', sourceTopic: 'content strategy', date: '2024-10-08' },
  ],

  // External: top-ranking editorial pages per topic - two per topic, each from
  // a unique site, no homepages. Metrics are real domain-level Ahrefs numbers
  // (batch-analysis, mode=subdomains), pulled 2026-07-03.
  external: [
    { url: 'https://ahrefs.com/blog/topical-authority/', kind: 'external', title: 'Topical Authority: What It Is, How Google Measures It, and How to Build It', sourceTopic: 'topical authority', date: null,
      metrics: { domainRating: 91, urlRating: 9.0, orgTraffic: 4291486, refdomains: 108662, ahrefsRank: 634 } },
    { url: 'https://www.semrush.com/blog/topical-authority/', kind: 'external', title: 'What is Topical Authority? (+ How to Build It)', sourceTopic: 'topical authority', date: null,
      metrics: { domainRating: 92, urlRating: 8.0, orgTraffic: 7000718, refdomains: 120405, ahrefsRank: 476 } },
    { url: 'https://yoast.com/content-clusters/', kind: 'external', title: 'Content clusters: What are they and do you need them?', sourceTopic: 'content clusters', date: null,
      metrics: { domainRating: 91, urlRating: 6.0, orgTraffic: 277079, refdomains: 55049, ahrefsRank: 1098 } },
    { url: 'https://blog.marketmuse.com/what-are-topic-clusters/', kind: 'external', title: 'Mastering Topic Clusters: A Comprehensive Guide for Content Strategists', sourceTopic: 'content clusters', date: null,
      metrics: { domainRating: 77, urlRating: 8.0, orgTraffic: 46820, refdomains: 1303, ahrefsRank: 22990 } },
    { url: 'https://blog.hubspot.com/marketing/what-is-a-pillar-page', kind: 'external', title: 'What Is a Pillar Page? (And Why It Matters For Your SEO Strategy)', sourceTopic: 'pillar pages', date: null,
      metrics: { domainRating: 93, urlRating: 15.0, orgTraffic: 526489, refdomains: 135817, ahrefsRank: 138 } },
    { url: 'https://backlinko.com/pillar-pages', kind: 'external', title: 'Pillar Pages: How to Create One + Examples', sourceTopic: 'pillar pages', date: null,
      metrics: { domainRating: 90, urlRating: 18.0, orgTraffic: 176213, refdomains: 58739, ahrefsRank: 1245 } },
    { url: 'https://moz.com/learn/seo/internal-link', kind: 'external', title: 'Internal Links SEO Best Practices', sourceTopic: 'internal linking', date: null,
      metrics: { domainRating: 91, urlRating: 13.0, orgTraffic: 1163471, refdomains: 105551, ahrefsRank: 677 } },
    { url: 'https://searchengineland.com/guide/internal-linking', kind: 'external', title: 'Internal Linking for SEO: Types, Strategies & Tools', sourceTopic: 'internal linking', date: null,
      metrics: { domainRating: 91, urlRating: 4.8, orgTraffic: 271428, refdomains: 78968, ahrefsRank: 919 } },
    { url: 'https://online.hbs.edu/blog/post/content-strategy', kind: 'external', title: 'How to Create a Content Strategy That Drives Results', sourceTopic: 'content strategy', date: null,
      metrics: { domainRating: 90, urlRating: 4.6, orgTraffic: 1548544, refdomains: 30400, ahrefsRank: 1216 } },
    { url: 'https://www.nngroup.com/articles/content-strategy/', kind: 'external', title: 'Content Strategy 101', sourceTopic: 'content strategy', date: null,
      metrics: { domainRating: 90, urlRating: 6.0, orgTraffic: 916955, refdomains: 51773, ahrefsRank: 1236 } },
  ],

  // Spare pool for reject/replace in the keyless sample run - same rules as
  // the live pool: real links, real Ahrefs domain-level metrics (2026-07-03),
  // every URL probed 200 OK, external spares from sites not already in the
  // list. Ten per kind, so every visible row can be swapped once.
  spares: {
    internal: [
      { url: 'https://zapier.com/blog/seo-strategies/', kind: 'internal', title: 'SEO strategies: How to rank in the age of AI', sourceTopic: 'content strategy', date: '2025-08-01' },
      { url: 'https://zapier.com/blog/programmatic-seo/', kind: 'internal', title: 'Programmatic SEO: How to do it & if you should', sourceTopic: 'topical authority', date: '2025-02-19' },
      { url: 'https://zapier.com/blog/best-keyword-research-tool/', kind: 'internal', title: 'The 4 best free keyword research tools', sourceTopic: 'topical authority', date: '2025-06-09' },
      { url: 'https://zapier.com/blog/best-seo-audit-tools/', kind: 'internal', title: 'The 9 best SEO audit tools', sourceTopic: 'content strategy', date: '2025-02-05' },
      { url: 'https://zapier.com/blog/automate-keyword-research/', kind: 'internal', title: 'Automating keyword research', sourceTopic: 'topical authority', date: '2024-08-21' },
      { url: 'https://zapier.com/blog/best-seo-tools/', kind: 'internal', title: 'The 11 best SEO tools', sourceTopic: 'content strategy', date: '2024-11-15' },
      { url: 'https://zapier.com/blog/content-marketing-examples/', kind: 'internal', title: '14 content marketing examples to inspire you', sourceTopic: 'content clusters', date: '2024-06-11' },
      { url: 'https://zapier.com/blog/crm-strategy/', kind: 'internal', title: 'Craft a winning CRM strategy in 8 steps', sourceTopic: 'content strategy', date: '2024-07-15' },
      { url: 'https://zapier.com/blog/facebook-ad-strategy-template/', kind: 'internal', title: 'How to create a Facebook ad strategy (with template)', sourceTopic: 'content strategy', date: '2025-05-01' },
      { url: 'https://zapier.com/blog/interactive-lead-content-outgrow/', kind: 'internal', title: 'Create interactive content to attract leads with Outgrow', sourceTopic: 'content clusters', date: '2024-09-13' },
    ],
    external: [
      { url: 'https://mailchimp.com/resources/topical-authority/', kind: 'external', title: 'Topical Authority: The Key to Better SEO Rankings', sourceTopic: 'topical authority', date: null,
        metrics: { domainRating: 93, urlRating: 4.6, orgTraffic: 2727490, refdomains: 320843, ahrefsRank: 150 } },
      { url: 'https://www.coursera.org/articles/content-strategy', kind: 'external', title: 'How to Develop a Content Strategy: A Step-by-Step Guide', sourceTopic: 'content strategy', date: null,
        metrics: { domainRating: 91, urlRating: 6.0, orgTraffic: 15840547, refdomains: 164297, ahrefsRank: 692 } },
      { url: 'https://www.siteimprove.com/blog/pillar-page-design/', kind: 'external', title: 'Designing Pillar Pages for Maximum SEO Impact', sourceTopic: 'pillar pages', date: null,
        metrics: { domainRating: 81, urlRating: 6.0, orgTraffic: 199689, refdomains: 7307, ahrefsRank: 10291 } },
      { url: 'https://www.orbitmedia.com/blog/content-cluster-strategy/', kind: 'external', title: 'How a Content Cluster Strategy Fits Into Your Digital Marketing Campaigns', sourceTopic: 'content clusters', date: null,
        metrics: { domainRating: 80, urlRating: 4.6, orgTraffic: 65890, refdomains: 7683, ahrefsRank: 12627 } },
      { url: 'https://www.seobility.net/en/wiki/Internal_Linking', kind: 'external', title: 'Internal Linking: What is that?', sourceTopic: 'internal linking', date: null,
        metrics: { domainRating: 80, urlRating: 7.0, orgTraffic: 1034305, refdomains: 8732, ahrefsRank: 14409 } },
      { url: 'https://www.columnfivemedia.com/how-to-create-a-content-strategy/', kind: 'external', title: 'How to Create a Content Strategy (Complete Guide + Free Toolkit)', sourceTopic: 'content strategy', date: null,
        metrics: { domainRating: 76, urlRating: 7.0, orgTraffic: 65238, refdomains: 3834, ahrefsRank: 30310 } },
      { url: 'https://www.interodigital.com/blog/internal-linking-for-seo-why-it-matters-and-how-to-get-it-right/', kind: 'external', title: 'Internal Linking for SEO: Why It Matters and How to Get It Right', sourceTopic: 'internal linking', date: null,
        metrics: { domainRating: 72, urlRating: 4.5, orgTraffic: 10107, refdomains: 3319, ahrefsRank: 71419 } },
      { url: 'https://www.gravitatedesign.com/blog/what-is-topical-authority/', kind: 'external', title: 'What Is Topical Authority in SEO (And How to Build It)', sourceTopic: 'topical authority', date: null,
        metrics: { domainRating: 69, urlRating: 7.0, orgTraffic: 4939, refdomains: 1604, ahrefsRank: 131672 } },
      { url: 'https://whitehat-seo.co.uk/blog/what-is-a-pillar-page', kind: 'external', title: 'What Is a Pillar Page? How to Build One That Ranks [2026 Guide]', sourceTopic: 'pillar pages', date: null,
        metrics: { domainRating: 64, urlRating: 4.9, orgTraffic: 5302, refdomains: 1832, ahrefsRank: 195332 } },
      { url: 'https://www.braintraffic.com/blog/what-is-content-strategy', kind: 'external', title: 'What Is Content Strategy? Connecting the Dots Between Disciplines', sourceTopic: 'content strategy', date: null,
        metrics: { domainRating: 62, urlRating: 6.0, orgTraffic: 18713, refdomains: 783, ahrefsRank: 232101 } },
    ],
  },

  // SERP view: real top organic results for "topical authority" (page-level
  // metrics from Ahrefs serp-overview, 2026-07-03).
  serp: {
    keyword: 'topical authority',
    rows: [
      { position: 2, url: 'https://ahrefs.com/blog/topical-authority/', title: 'Topical Authority: What It Is, How Google Measures It, and How to Build It', domainRating: 91, urlRating: 9, traffic: 1048, value: 175988, refdomains: 510, backlinks: 1467 },
      { position: 3, url: 'https://www.semrush.com/blog/topical-authority/', title: 'What is Topical Authority? (+ How to Build It)', domainRating: 92, urlRating: 8, traffic: 393, value: 74061, refdomains: 309, backlinks: 848 },
      { position: 6, url: 'https://mailchimp.com/resources/topical-authority/', title: 'Topical Authority: The Key to Better SEO Rankings', domainRating: 93, urlRating: 4, traffic: 234, value: 45132, refdomains: 34, backlinks: 35 },
      { position: 7, url: 'https://www.reddit.com/r/SEO/comments/1qac2us/understanding_topical_authority/', title: 'Understanding topical authority : r/SEO', domainRating: 95, urlRating: 0, traffic: 56, value: 8868, refdomains: 2, backlinks: 2 },
      { position: 9, url: 'https://blog.marketmuse.com/topical-authority-primer/', title: 'Topical Authority Is the New Keyword Research', domainRating: 77, urlRating: 5, traffic: 122, value: 21677, refdomains: 45, backlinks: 73 },
      { position: 10, url: 'https://www.youtube.com/watch?v=XN1Ulc4brgA', title: 'How to Build Topical Authority for your Website', domainRating: 99, urlRating: 4, traffic: 114, value: 24552, refdomains: 2, backlinks: 6 },
    ],
  },
}
