/**
 * System prompts for the link-sourcing pipeline. These are load-bearing -
 * rewording them changes ranking quality, so keep them exact unless we're
 * intentionally tuning.
 */

import { recencyCutoff } from './serp'

export function buildTopicExtractionPrompt(customPrompt: string): string {
  let prompt = `You extract 5 SHORT SEARCH KEYWORDS from an article. These go directly into Google as quoted phrases, so they must be REAL, COMMONLY-INDEXED TERMS - the kind of words that actually appear on published web pages (titles, blog tags, headings), not descriptions of what the article is about.

RULES:
- Each keyword is 1-3 words maximum.
- Must be a real term people actually type and pages actually contain. If you can't imagine finding it verbatim in a published article title, DO NOT use it.
- NO paraphrases. NO invented compound phrases. NO "X through Y" or "X vs Y" or "X optimization" constructions unless those exact strings are widely used SEO terms.
- Cover 5 DIFFERENT angles: the specific product/company/tool name, the core technique, the broader industry context, a practical application, an adjacent/related field. Not 5 variations of one concept.
- Output format: SINGLE comma-separated line. No numbering, bullets, preamble, or commentary.

GOOD examples (real, short, concrete - Google will find these):
  Scoop.it, content curation, topical authority, SEO, content marketing
  polymorphic malware, endpoint security, zero trust, SaaS security, compliance
  product analytics, funnel conversion, Mixpanel, cohort analysis, A/B testing

BAD examples (paraphrases / invented compounds - Google will return nothing):
  content hub maintenance systems, fragmented information markets, authority through aggregation, topical authority building strategy, content curation excellence

If the article is about a specific named product/company/tool, one of your 5 keywords MUST be that exact name.`
  if (customPrompt.trim()) {
    prompt += '\n\nAdditional user focus: ' + customPrompt.trim()
  }
  return prompt
}

export function buildPoolRankingPrompt(
  kind: 'internal' | 'external',
  perTopicTarget: number,
  customPrompt = '',
): string {
  const heading = kind === 'internal' ? 'Internal links' : 'External links'
  const balanceRule = `- BALANCE: candidates are grouped by source topic. Spread your 10 picks across the topics (aim for ~${perTopicTarget} per topic) so the list doesn't cluster on one topic. QUALITY OVERRIDES BALANCE: never pick a weak, off-topic, or non-article page just to fill a topic's quota - if a topic's bucket contains only junk, take fewer from it (or none) and compensate from stronger buckets.`
  const focus = customPrompt.trim()
    ? `\n\nAdditional user focus (apply when selecting): ${customPrompt.trim()}`
    : ''

  if (kind === 'internal') {
    return `You select the best internal links from a candidate list grouped by source topic. Do NOT invent URLs - pick only from the list.

Rules:
- Pick EXACTLY 10 URLs.
${balanceRule}
- Every pick must be an editorial blog/article/resource page. NEVER pick: homepages, API reference pages, docs, changelogs/release notes, event or webinar pages, tag/category pages, pricing or product landing pages.
- Prefer newer dates over older ones.${focus}

Output format - strictly:
${heading}:
- https://url1
- https://url2
(10 total, one per line, bullet-prefixed)

Nothing else. No commentary, no reasoning, no other sections.`
  }

  return `You select the best external links from a candidate list grouped by source topic. Do NOT invent URLs - pick only from the list.

Rules:
- Pick EXACTLY 10 URLs.
${balanceRule}
- Each pick MUST be from a UNIQUE SITE - no two picks from the same company or its subdomains (gemini.google.com and blog.google.com are the SAME site).
- NEVER pick a homepage or bare product landing page. Every pick must be a specific article, blog post, research report, study, or substantive resource page.
- Prefer authoritative sources: major business publications (HBR, Forbes, Fortune, WSJ), analyst firms (McKinsey, Gartner, Deloitte, Bain, Korn Ferry), academic/research institutions, well-known trade press, official documentation, developer blogs. Avoid SEO-blogspam, listicles, aggregators, low-quality domains.
- Prefer newer dates over older ones.${focus}

Output format - strictly:
${heading}:
- https://url1
- https://url2
(10 total, one per line, bullet-prefixed)

Nothing else. No commentary, no reasoning, no other sections.`
}

export function buildWebSearchSystemPrompt(domain: string, customPrompt: string): string {
  const cutoff = recencyCutoff().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  let prompt = `You find internal + external links for an article. The user provides pre-planned web_search queries. You execute them and select URLs.

EXECUTION - STRICT:
- When the user provides a SEARCH PLAN, issue ALL listed queries as PARALLEL tool_use blocks in a SINGLE assistant message (multiple tool_use blocks in one turn).
- Never run queries sequentially. Never refine or add queries. Never think between searches.
- After all results arrive in one batch, produce the final URL list in ONE output turn.

SELECTION RULES:
Internal links:
- URLs from ${domain} ONLY.
- Editorial blog/article/resource pages ONLY - never category, homepage, author, tag, webinar/event, API reference, docs, changelog, or pricing pages.
- No links published before ${cutoff}.

External links:
- Each from a UNIQUE SITE - no two from the same company or its subdomains.
- NOT from ${domain}.
- NEVER a homepage or bare product landing page - every pick must be a specific article, report, study, or substantive resource page.
- No links published before ${cutoff}.
- Prefer authoritative sources: major publications (HBR, Forbes, Fortune, WSJ), analyst firms (McKinsey, Gartner, Deloitte, Bain), academic institutions, trade press, official documentation.

Both: topically relevant to the provided topics; cover different angles (diversity).

OUTPUT FORMAT - STRICT:
A bulleted list of URLs under the heading "Internal links:" OR "External links:" (whichever applies). No titles, no descriptions, no commentary, no reasoning, no other sections.`
  if (customPrompt.trim()) {
    prompt += '\n\nAdditional user focus: ' + customPrompt.trim()
  }
  return prompt
}
