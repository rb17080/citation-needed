/**
 * 6-step link-sourcing pipeline: extract topics -> gather candidates -> rank -> stream.
 *
 * Two execution paths:
 *   - SerpAPI (primary):   1 query per topic -> pools -> Claude ranks pool, no tools
 *   - web_search (fallback): pre-planned queries -> Claude parallel tool_use -> pick
 *
 * Mutates nothing directly - pushes URLs, topics, pools, and log lines back via
 * callbacks so React owns the state.
 */

import { callAnthropicStreaming, extractTopics } from './anthropic'
import {
  dedupeByUrl,
  filterExternalCandidates,
  filterInternalCandidates,
  planExternalQueries,
  planInternalQueries,
  registrableDomainOf,
  serpApiExternalQueryForTopic,
  serpApiInternalQueryForTopic,
  serpApiSearchByTopics,
} from './serp'
import {
  buildPoolRankingPrompt,
  buildTopicExtractionPrompt,
  buildWebSearchSystemPrompt,
} from './prompts'
import { UrlStreamParser } from './urlStreamParser'
import type { Candidate, RunOptions } from './types'

export async function runPipeline(opts: RunOptions): Promise<void> {
  const { hasSerpKey, model, domain, article, customPrompt, abortSignal, callbacks } = opts
  const { getInternalCandidates } = opts
  const { onLog, onUrl, onTopics, onPools, onUsage } = callbacks

  onLog(`Starting research for domain: ${domain}`, 'info')
  onLog(`Article length: ${article.length} chars`, 'info')
  onLog(`Model: ${model}`, 'info')
  onLog(
    `Mode: ${hasSerpKey ? 'SerpAPI (Google) + Claude ranking' : 'Anthropic web_search (fallback)'}`,
    'info',
  )

  // ===== Phase 0: topic extraction (Haiku, non-streaming) =====
  onLog('Phase 0: extracting search topics (Haiku 4.5)', 'info')
  const extraction = await extractTopics(
    article,
    buildTopicExtractionPrompt(customPrompt),
    abortSignal,
  )
  if (!extraction.topics.length) throw new Error('Topic extraction returned no topics')
  const topics = extraction.topics
  onTopics?.(topics)
  onLog(`Topics: ${topics.join(' · ')}`, 'info')
  onLog(
    `extraction tokens: ${extraction.usage.input_tokens || 0} in · ${extraction.usage.output_tokens || 0} out`,
    'info',
  )
  // Topic extraction uses Haiku (~3x cheaper than Sonnet) - pass the model so
  // the cost meter prices it correctly instead of at Sonnet rates.
  onUsage?.({
    model: 'claude-haiku-4-5-20251001',
    inputTokens: extraction.usage.input_tokens || 0,
    outputTokens: extraction.usage.output_tokens || 0,
  })

  if (hasSerpKey) {
    await runSerpApiFlow({
      model,
      domain,
      customPrompt,
      topics,
      abortSignal,
      onLog,
      onUrl,
      onPools,
      onUsage,
      getInternalCandidates,
    })
  } else {
    await runWebSearchFlow({
      model,
      domain,
      customPrompt,
      topics,
      abortSignal,
      onLog,
      onUrl,
      onUsage,
    })
  }
  onLog('Pipeline complete', 'done')
}

/* ============================================================ */
/* SerpAPI flow (primary)                                       */
/* ============================================================ */

async function runSerpApiFlow(args: {
  model: string
  domain: string
  customPrompt: string
  topics: string[]
  abortSignal: AbortSignal
  onLog: RunOptions['callbacks']['onLog']
  onUrl: RunOptions['callbacks']['onUrl']
  onPools?: RunOptions['callbacks']['onPools']
  onUsage?: RunOptions['callbacks']['onUsage']
  getInternalCandidates?: RunOptions['getInternalCandidates']
}) {
  const { model, domain, customPrompt, topics, abortSignal, onLog, onUrl, onPools, onUsage } = args
  const { getInternalCandidates } = args

  // --- Phase 1a: internal (sitemap-first, SerpAPI site: fallback) ---
  const gatherInternalViaSerp = async (): Promise<Candidate[]> => {
    onLog(
      `Phase 1a: gathering internal candidates (SerpAPI · ${topics.length} parallel queries)`,
      'info',
    )
    topics.forEach((t, i) =>
      onLog(`  ${i + 1}. ${serpApiInternalQueryForTopic(domain, t)}`, 'search'),
    )
    const rawInt = await serpApiSearchByTopics(
      topics,
      t => serpApiInternalQueryForTopic(domain, t),
      abortSignal,
      25,
      (topic, err) => onLog(`  query for "${topic}" failed: ${err.message}`, 'error'),
    )
    const pool = filterInternalCandidates(dedupeByUrl(rawInt), domain)
    onLog(
      `  → ${rawInt.length} raw across ${topics.length} queries, ${pool.length} after filter`,
      'result',
    )
    return pool
  }

  let internalPool: Candidate[] = []
  if (getInternalCandidates) {
    onLog('Phase 1a: gathering internal candidates (sitemap)', 'info')
    try {
      const sm = await getInternalCandidates(domain, topics, abortSignal)
      internalPool = filterInternalCandidates(dedupeByUrl(sm), domain)
      onLog(`  → sitemap returned ${sm.length} urls, ${internalPool.length} usable`, 'result')
      if (!internalPool.length) throw new Error('no usable internal URLs from sitemap')
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw e
      const msg = e instanceof Error ? e.message : String(e)
      onLog(`  sitemap unavailable (${msg}) - falling back to SerpAPI site: search`, 'info')
      internalPool = await gatherInternalViaSerp()
    }
  } else {
    internalPool = await gatherInternalViaSerp()
  }

  // --- Phase 1b: external ---
  onLog(
    `Phase 1b: gathering external candidates (SerpAPI · ${topics.length} parallel queries)`,
    'info',
  )
  topics.forEach((t, i) => onLog(`  ${i + 1}. ${serpApiExternalQueryForTopic(t)}`, 'search'))
  const rawExt = await serpApiSearchByTopics(
    topics,
    serpApiExternalQueryForTopic,
    abortSignal,
    25,
    (topic, err) => onLog(`  query for "${topic}" failed: ${err.message}`, 'error'),
  )
  const externalPool = filterExternalCandidates(dedupeByUrl(rawExt), domain)
  onLog(
    `  → ${rawExt.length} raw across ${topics.length} queries, ${externalPool.length} after filter`,
    'result',
  )

  onPools?.(internalPool, externalPool)

  if (!internalPool.length && !externalPool.length) {
    throw new Error('No candidates found - try a broader domain or different topics')
  }

  // --- Phase 2: rank in parallel ---
  onLog('Phase 2: Claude ranking candidates (parallel, no tools)', 'info')
  await Promise.all([
    internalPool.length
      ? claudeSelectFromPool({
          kind: 'internal',
          pool: internalPool,
          topics,
          model,
          customPrompt,
          abortSignal,
          onLog,
          onUrl,
          onUsage,
        })
      : Promise.resolve(),
    externalPool.length
      ? claudeSelectFromPool({
          kind: 'external',
          pool: externalPool,
          topics,
          model,
          customPrompt,
          abortSignal,
          onLog,
          onUrl,
          onUsage,
        })
      : Promise.resolve(),
  ])
}

async function claudeSelectFromPool(args: {
  kind: 'internal' | 'external'
  pool: Candidate[]
  topics: string[]
  model: string
  customPrompt: string
  abortSignal: AbortSignal
  onLog: RunOptions['callbacks']['onLog']
  onUrl: RunOptions['callbacks']['onUrl']
  onUsage?: RunOptions['callbacks']['onUsage']
}) {
  const { kind, pool, topics, model, customPrompt, abortSignal, onLog, onUrl, onUsage } = args

  // Group candidates by source topic for bucket-balanced ranking.
  const byTopic = new Map<string, Candidate[]>()
  for (const t of topics) byTopic.set(t, [])
  for (const c of pool) {
    const t = c.sourceTopic || '(other)'
    if (!byTopic.has(t)) byTopic.set(t, [])
    byTopic.get(t)!.push(c)
  }

  let candidatesText = ''
  let idx = 1
  for (const [topic, items] of byTopic.entries()) {
    if (!items.length) {
      candidatesText += `\n=== Topic: "${topic}" - NO CANDIDATES ===\n\n`
      continue
    }
    candidatesText += `\n=== Topic: "${topic}" (${items.length} candidates) ===\n`
    for (const c of items) {
      const snippet = (c.snippet || '').slice(0, 180).replace(/\s+/g, ' ')
      const dateStr = c.date ? ` | ${c.date}` : ''
      candidatesText += `${idx}. ${c.url}\n   "${c.title}"${dateStr}\n   ${snippet}\n\n`
      idx++
    }
  }

  const topicsText = topics.map(t => '- ' + t).join('\n')
  const perTopicTarget = Math.max(1, Math.round(10 / (topics.length || 5)))
  const sysPrompt = buildPoolRankingPrompt(kind, perTopicTarget, customPrompt)
  const userMsg = `Topics the article covers:\n${topicsText}\n\nCandidates grouped by source topic (${pool.length} total - pick exactly 10 with balanced coverage across the topic buckets):\n${candidatesText}`

  // Look the picked URL back up in the pool so we can label it with its source
  // topic (+ title). Normalize the same way the pool dedupe does.
  const norm = (u: string) => u.split('#')[0].replace(/\/+$/, '').toLowerCase()
  const byUrl = new Map<string, Candidate>()
  for (const c of pool) byUrl.set(norm(c.url), c)
  // Enforce ONE external link per site in code - the prompt asks for it but
  // the model doesn't reliably comply, which is the whole point of the tool.
  // Keyed by registrable domain so gemini.google.com and blog.google.com
  // count as the same site.
  const seenHosts = new Set<string>()

  const emit = (u: string) => {
    if (kind === 'external') {
      const h = registrableDomainOf(u)
      if (h) {
        if (seenHosts.has(h)) return
        seenHosts.add(h)
      }
    }
    const c = byUrl.get(norm(u))
    onUrl(u, kind, c ? { sourceTopic: c.sourceTopic, title: c.title || undefined } : undefined)
  }

  const parser = new UrlStreamParser(
    u => {
      if (kind === 'internal') emit(u)
    },
    u => {
      if (kind === 'external') emit(u)
    },
  )

  onLog(`${kind} selection: Claude picking 10 from ${pool.length}`, 'info')

  const stop = await callAnthropicStreaming({
    model,
    system: sysPrompt,
    messages: [{ role: 'user', content: userMsg }],
    useTools: false,
    signal: abortSignal,
    callbacks: {
      onTextDelta: d => parser.feed(d),
      onUsage: u => {
        if (u.phase === 'final') {
          onUsage?.({
            model,
            inputTokens: u.input,
            outputTokens: u.output,
            cacheReadTokens: u.cacheRead,
            cacheCreationTokens: u.cacheCreate,
          })
        }
      },
    },
    onRateLimitWait: (s, a) =>
      onLog(`Rate limit hit - waiting ${s}s then retrying (attempt ${a}/3)`, 'error'),
  })
  parser.finish()
  onLog(`${kind} selection complete (stop_reason=${stop || 'unknown'})`, 'done')
}

/* ============================================================ */
/* web_search fallback flow                                     */
/* ============================================================ */

async function runWebSearchFlow(args: {
  model: string
  domain: string
  customPrompt: string
  topics: string[]
  abortSignal: AbortSignal
  onLog: RunOptions['callbacks']['onLog']
  onUrl: RunOptions['callbacks']['onUrl']
  onUsage?: RunOptions['callbacks']['onUsage']
}) {
  const { model, domain, customPrompt, topics, abortSignal, onLog, onUrl, onUsage } = args

  const sysPrompt = buildWebSearchSystemPrompt(domain, customPrompt)
  const systemBlocks = [
    { type: 'text' as const, text: sysPrompt, cache_control: { type: 'ephemeral' as const } },
  ]
  const topicsList = topics.map(t => '- ' + t).join('\n')

  // Phase 1: internal
  const intQueries = planInternalQueries(domain, topics)
  onLog('Phase 1/2: internal links (parallel web_search)', 'info')
  onLog('pre-planned queries:', 'info')
  intQueries.forEach((q, i) => onLog(`  ${i + 1}. ${q}`, 'search'))

  const parser1 = new UrlStreamParser(
    u => onUrl(u, 'internal'),
    () => {},
  )
  const userText1 =
    `Topics extracted from the article:\n${topicsList}\n\n` +
    `SEARCH PLAN - issue these ${intQueries.length} web_search calls in PARALLEL within a SINGLE assistant turn (multiple tool_use blocks in one message). Do NOT iterate:\n` +
    intQueries.map((q, i) => `${i + 1}. ${q}`).join('\n') +
    `\n\nAfter all results arrive in one batch, select 10 internal URLs from ${domain} that best match the topics with DIVERSITY (no two URLs about the same sub-topic). Output under the heading "Internal links:" as a bullet list. Nothing else.`

  const stop1 = await callAnthropicStreaming({
    model,
    system: systemBlocks,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText1 }] }],
    useTools: true,
    signal: abortSignal,
    callbacks: {
      onTextDelta: d => parser1.feed(d),
      onSearchQuery: q => onLog(`web_search: "${q}"`, 'search'),
      onSearchResult: r => onLog(`  → ${r}`, 'result'),
      onUsage: u => {
        if (u.phase === 'final') {
          onUsage?.({
            model,
            inputTokens: u.input,
            outputTokens: u.output,
            cacheReadTokens: u.cacheRead,
            cacheCreationTokens: u.cacheCreate,
          })
        }
      },
    },
    onRateLimitWait: (s, a) =>
      onLog(`Rate limit hit - waiting ${s}s then retrying (attempt ${a}/3)`, 'error'),
  })
  parser1.finish()
  onLog(`Phase 1 complete (stop_reason=${stop1 || 'unknown'})`, 'done')

  // Phase 2: external
  const extQueries = planExternalQueries(topics)
  onLog('Phase 2/2: external links (parallel web_search)', 'info')
  onLog('pre-planned queries:', 'info')
  extQueries.forEach((q, i) => onLog(`  ${i + 1}. ${q}`, 'search'))

  const seenHosts2 = new Set<string>()
  const parser2 = new UrlStreamParser(
    () => {},
    u => {
      const h = registrableDomainOf(u)
      if (h) {
        if (seenHosts2.has(h)) return
        seenHosts2.add(h)
      }
      onUrl(u, 'external')
    },
  )
  const userText2 =
    `Topics extracted from the article:\n${topicsList}\n\n` +
    `SEARCH PLAN - issue these ${extQueries.length} web_search calls in PARALLEL within a SINGLE assistant turn (multiple tool_use blocks in one message). Do NOT iterate:\n` +
    extQueries.map((q, i) => `${i + 1}. ${q}`).join('\n') +
    `\n\nAfter all results arrive in one batch, select 10 external URLs (NOT from ${domain}, each from a UNIQUE DOMAIN, authoritative sources preferred) with DIVERSITY across topics. Output under the heading "External links:" as a bullet list. Nothing else.`

  const stop2 = await callAnthropicStreaming({
    model,
    system: systemBlocks,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText2 }] }],
    useTools: true,
    signal: abortSignal,
    callbacks: {
      onTextDelta: d => parser2.feed(d),
      onSearchQuery: q => onLog(`web_search: "${q}"`, 'search'),
      onSearchResult: r => onLog(`  → ${r}`, 'result'),
      onUsage: u => {
        if (u.phase === 'final') {
          onUsage?.({
            model,
            inputTokens: u.input,
            outputTokens: u.output,
            cacheReadTokens: u.cacheRead,
            cacheCreationTokens: u.cacheCreate,
          })
        }
      },
    },
    onRateLimitWait: (s, a) =>
      onLog(`Rate limit hit - waiting ${s}s then retrying (attempt ${a}/3)`, 'error'),
  })
  parser2.finish()
  onLog(`Phase 2 complete (stop_reason=${stop2 || 'unknown'})`, 'done')
}
