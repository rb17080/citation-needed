/**
 * Regenerate-on-demand: replace a rejected link with a new pick. Two paths,
 * auto-dispatched by whether a candidate pool is available:
 *
 *   - regenFromPool:      SerpAPI run had a pool -> Claude picks from unused
 *                         candidates (cheap). Tops up from SerpAPI if pool thin.
 *   - regenViaWebSearch:  web_search fallback run -> re-runs pre-planned
 *                         queries in a parallel tool_use turn.
 *
 * Returns the replacement URL(s). Caller splices them into the visible table.
 */

import { callAnthropicStreaming } from './anthropic'
import {
  dedupeByUrl,
  filterExternalCandidates,
  filterInternalCandidates,
  planExternalQueries,
  planInternalQueries,
  serpApiExternalQueryForTopic,
  serpApiInternalQueryForTopic,
  serpApiSearchByTopics,
} from './serp'
import { buildWebSearchSystemPrompt } from './prompts'
import { UrlStreamParser } from './urlStreamParser'
import type { Candidate, LinkKind, LogKind } from './types'

export interface RegenContext {
  /** True when the user has a SerpAPI key - enables pool top-up via SerpAPI. */
  hasSerpKey: boolean
  model: string
  domain: string
  customPrompt: string
  topics: string[]
  pools: { internal: Candidate[]; external: Candidate[] } | null
  allUsedUrls: string[]
  abortSignal: AbortSignal
}

export async function regenerateLink(
  kind: LinkKind,
  rejectedUrls: string[],
  ctx: RegenContext,
  onLog: (text: string, kind?: LogKind) => void,
): Promise<string[]> {
  if (!ctx.topics.length) {
    throw new Error('Missing topics - run a full search first')
  }
  if (ctx.pools) {
    return regenFromPool(kind, rejectedUrls, ctx, onLog)
  }
  return regenViaWebSearch(kind, rejectedUrls, ctx, onLog)
}

async function regenFromPool(
  kind: LinkKind,
  rejectedUrls: string[],
  ctx: RegenContext,
  onLog: (text: string, kind?: LogKind) => void,
): Promise<string[]> {
  const pool = kind === 'internal' ? ctx.pools!.internal : ctx.pools!.external
  const allUsed = new Set(ctx.allUsedUrls)
  const unused = pool.filter(c => !allUsed.has(c.url))
  const count = rejectedUrls.length

  // Top up from SerpAPI if pool is thin - matches the original's ~count+3 threshold.
  if (unused.length < count + 3 && ctx.hasSerpKey) {
    onLog('Pool thin - fetching more candidates from SerpAPI (per-topic)', 'info')
    const builder =
      kind === 'internal'
        ? (t: string) => serpApiInternalQueryForTopic(ctx.domain, t)
        : serpApiExternalQueryForTopic
    try {
      const raw = await serpApiSearchByTopics(ctx.topics, builder, ctx.abortSignal, 25)
      const filtered =
        kind === 'internal'
          ? filterInternalCandidates(dedupeByUrl(raw), ctx.domain)
          : filterExternalCandidates(dedupeByUrl(raw), ctx.domain)
      for (const c of filtered) {
        if (!allUsed.has(c.url) && !pool.some(p => p.url === c.url)) {
          pool.push(c)
          unused.push(c)
        }
      }
      onLog(`  → pool now has ${unused.length} unused candidates`, 'result')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onLog('SerpAPI refetch failed: ' + msg, 'error')
    }
  }

  if (!unused.length) throw new Error('Candidate pool exhausted')

  const topicsText = ctx.topics.map(t => '- ' + t).join('\n')
  const candidatesText = unused
    .slice(0, 60)
    .map((c, i) => {
      const snippet = (c.snippet || '').slice(0, 180).replace(/\s+/g, ' ')
      const dateStr = c.date ? ` | ${c.date}` : ''
      return `${i + 1}. ${c.url}\n   "${c.title}"${dateStr}\n   ${snippet}`
    })
    .join('\n\n')

  const heading = kind === 'internal' ? 'Internal links' : 'External links'
  const uniqueDomainRule =
    kind === 'external'
      ? '- Each pick must be from a UNIQUE DOMAIN different from all already-used URLs.\n'
      : ''

  const focus = ctx.customPrompt.trim()
    ? `\n- Additional user focus (apply when selecting): ${ctx.customPrompt.trim()}`
    : ''
  const sysPrompt = `You replace rejected ${kind} links. Pick EXACTLY ${count} URLs from the candidate list provided - do NOT invent URLs.
${uniqueDomainRule}- Pick the best remaining candidates: editorial article/blog/resource pages, never homepages, API reference, changelog, event, or landing pages.
- Pick URLs topically different from each other.${focus}

Output format - strictly:
${heading}:
- https://url1
(${count} total, one per line, bullet-prefixed)

Nothing else.`

  const userMsg =
    `Topics:\n${topicsText}\n\n` +
    `User rejected: ${rejectedUrls.join(', ')}\n\n` +
    `Already used (do not pick any of these): ${[...allUsed].join(', ')}\n\n` +
    `Candidates (${unused.length} options - pick exactly ${count}):\n\n${candidatesText}`

  onLog(`Regen ${kind}: Claude picking ${count} from ${unused.length} unused candidates`, 'info')

  const replacements: string[] = []
  const parser = new UrlStreamParser(
    u => {
      if (kind === 'internal') replacements.push(u)
    },
    u => {
      if (kind === 'external') replacements.push(u)
    },
  )

  await callAnthropicStreaming({
    model: ctx.model,
    system: sysPrompt,
    messages: [{ role: 'user', content: userMsg }],
    useTools: false,
    signal: ctx.abortSignal,
    callbacks: {
      onTextDelta: d => parser.feed(d),
    },
    onRateLimitWait: (s, a) =>
      onLog(`Rate limit hit - waiting ${s}s then retrying (attempt ${a}/3)`, 'error'),
  })
  parser.finish()

  if (!replacements.length) throw new Error('No replacement URLs returned')
  onLog(`Regen: got ${replacements.length} replacement(s)`, 'done')
  return replacements.slice(0, count)
}

async function regenViaWebSearch(
  kind: LinkKind,
  rejectedUrls: string[],
  ctx: RegenContext,
  onLog: (text: string, kind?: LogKind) => void,
): Promise<string[]> {
  const count = rejectedUrls.length
  const systemBlocks = [
    {
      type: 'text' as const,
      text: buildWebSearchSystemPrompt(ctx.domain, ctx.customPrompt),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
  const topicsList = ctx.topics.map(t => '- ' + t).join('\n')

  const queries =
    kind === 'internal'
      ? planInternalQueries(ctx.domain, ctx.topics)
      : planExternalQueries(ctx.topics)
  const heading = kind === 'internal' ? 'Internal links' : 'External links'
  const uniqueDomainRule =
    kind === 'external' ? ', each from a UNIQUE domain different from already-used URLs' : ''

  const userText =
    `Topics extracted from the article:\n${topicsList}\n\n` +
    `REGEN TASK: Replace ${count} rejected ${kind} link(s).\n` +
    `Rejected: ${rejectedUrls.join(', ')}\n` +
    `Already-used URLs (do not repeat any of these): ${ctx.allUsedUrls.join(', ')}\n\n` +
    `SEARCH PLAN - issue these ${queries.length} web_search calls in PARALLEL within a SINGLE assistant turn (multiple tool_use blocks in one message). Do NOT iterate:\n` +
    queries.map((q, i) => `${i + 1}. ${q}`).join('\n') +
    `\n\nAfter all results arrive in one batch, select exactly ${count} replacement ${kind} URL(s), best-quality first${uniqueDomainRule}. Output under the heading "${heading}:" as a bullet list. Nothing else.`

  onLog(
    `Regen (web_search fallback): ${queries.length} parallel queries for ${count} new ${kind} link(s)`,
    'info',
  )
  queries.forEach((q, i) => onLog(`  ${i + 1}. ${q}`, 'search'))

  const replacements: string[] = []
  const parser = new UrlStreamParser(
    u => {
      if (kind === 'internal') replacements.push(u)
    },
    u => {
      if (kind === 'external') replacements.push(u)
    },
  )

  await callAnthropicStreaming({
    model: ctx.model,
    system: systemBlocks,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    useTools: true,
    signal: ctx.abortSignal,
    callbacks: {
      onTextDelta: d => parser.feed(d),
      onSearchQuery: q => onLog(`web_search: "${q}"`, 'search'),
      onSearchResult: r => onLog(`  → ${r}`, 'result'),
    },
    onRateLimitWait: (s, a) =>
      onLog(`Rate limit hit - waiting ${s}s then retrying (attempt ${a}/3)`, 'error'),
  })
  parser.finish()

  if (!replacements.length) throw new Error('No replacement URLs returned')
  onLog(`Regen: got ${replacements.length} replacement(s)`, 'done')
  return replacements.slice(0, count)
}
