/**
 * SerpAPI client (primary candidate-gathering path). Calls our own serverless
 * proxy at /.netlify/functions/serp - the proxy forwards to SerpAPI server-side
 * so the browser never makes a CORS-laden call and the key stays out of the URL.
 *
 * Query strategy: one short query per extracted topic, fired in parallel.
 * Per-topic queries guarantee diversity in the candidate pool (a single OR'd
 * mega-query lets Google cluster overlap-heavy pages at the top).
 */

import { authedFetch } from '../settings'
import type { Candidate } from './types'

/** Kept short - these become -inurl: terms and long queries degrade results. */
const INTERNAL_QUERY_EXCLUSIONS = [
  '/tag/',
  '/category/',
  '/author/',
  '/search',
  '/page/',
]

/** Full client-side exclusion list: taxonomy junk + reference/marketing
 *  sections that are never citable editorial content. */
const INTERNAL_URL_EXCLUSIONS = [
  '/tag/',
  '/category/',
  '/categories/',
  '/author/',
  '/authors/',
  '/search',
  '/page/',
  '/api/',
  '/apis/',
  '/docs/',
  '/documentation/',
  '/reference/',
  '/change-log/',
  '/changelog/',
  '/release-notes/',
  '/events/',
  '/event/',
  '/webinar',
  '/integrations/',
  '/pricing',
  '/legal',
  '/privacy',
  '/terms',
  '/careers',
  '/contact',
]

/**
 * Recency floor for candidate gathering: rolling 24-month window (replaces the
 * old hardcoded 1/1/2023, which aged into "anything newer than 3.5 years").
 */
export function recencyCutoff(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - 24)
  return d
}

function tbsRecency(): string {
  const c = recencyCutoff()
  return `cdr:1,cd_min:${c.getMonth() + 1}/${c.getDate()}/${c.getFullYear()}`
}

export function normalizeDomain(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/** Common multi-part public suffixes, so "bbc.co.uk" doesn't collapse to "co.uk". */
const MULTI_PART_TLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'co.jp',
  'or.jp',
  'ne.jp',
  'com.br',
  'com.mx',
  'com.ar',
  'co.in',
  'co.za',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.cn',
  'com.tr',
  'co.kr',
])

/**
 * Registrable domain (eTLD+1-ish) of a URL: gemini.google.com and
 * blog.google.com both -> google.com. Used for the "one external link per
 * site" rule so two subdomains of the same company can't both make the list.
 */
export function registrableDomainOf(url: string): string {
  const h = hostOf(url)
  if (!h) return ''
  const parts = h.split('.')
  if (parts.length <= 2) return h
  const lastTwo = parts.slice(-2).join('.')
  const take = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2
  return parts.slice(-take).join('.')
}

export function serpApiInternalQueryForTopic(domain: string, topic: string): string {
  const host = normalizeDomain(domain)
  const exclusions = INTERNAL_QUERY_EXCLUSIONS.map(p => `-inurl:${p}`).join(' ')
  return `site:${host} "${topic.replace(/"/g, '')}" ${exclusions}`.trim()
}

export function serpApiExternalQueryForTopic(topic: string): string {
  // Content-intent modifiers steer Google toward articles and research instead
  // of the product homepage a bare quoted brand/topic name returns.
  return `"${topic.replace(/"/g, '')}" (guide OR report OR study OR statistics OR research OR blog)`
}

async function serpApiSearch(query: string, signal: AbortSignal, count = 25): Promise<Candidate[]> {
  const params = new URLSearchParams({
    q: query,
    num: String(count),
    tbs: tbsRecency(),
    engine: 'google',
  })
  // The proxy reads the user's SerpAPI key from the request header;
  // `api_key` is intentionally NOT in the query string.
  const res = await authedFetch(`/.netlify/functions/serp?${params.toString()}`, {
    method: 'GET',
    signal,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error || j.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(`SerpAPI: ${msg}`)
  }
  const data = await res.json()
  const rows = (data.organic_results || []) as Array<{
    link?: string
    title?: string
    snippet?: string
    date?: string
    position?: number
  }>
  return rows
    .filter(r => !!r.link)
    .map(r => ({
      url: r.link!,
      title: r.title || '',
      snippet: r.snippet || '',
      date: r.date || '',
      position: r.position || 0,
    }))
}

export async function serpApiSearchByTopics(
  topics: string[],
  queryBuilder: (topic: string) => string,
  signal: AbortSignal,
  countPerTopic = 25,
  onQueryError?: (topic: string, err: Error) => void,
): Promise<Candidate[]> {
  const promises = topics.map(topic =>
    serpApiSearch(queryBuilder(topic), signal, countPerTopic)
      .then(results => {
        results.forEach(r => {
          r.sourceTopic = topic
        })
        return results
      })
      .catch(err => {
        if (err?.name === 'AbortError') throw err
        onQueryError?.(topic, err instanceof Error ? err : new Error(String(err)))
        return [] as Candidate[]
      }),
  )
  const batches = await Promise.all(promises)
  return batches.flat()
}

export function dedupeByUrl(results: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const r of results) {
    const key = (r.url || '').split('#')[0].replace(/\/+$/, '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export function filterInternalCandidates(results: Candidate[], domain: string): Candidate[] {
  const host = normalizeDomain(domain)
  return results.filter(r => {
    const h = hostOf(r.url)
    if (!h || !h.endsWith(host)) return false
    try {
      const path = new URL(r.url).pathname
      if (path === '/' || path === '') return false
      const lower = path.toLowerCase()
      if (INTERNAL_URL_EXCLUSIONS.some(p => lower.includes(p))) return false
      const segs = path.split('/').filter(Boolean)
      if (segs.length === 0) return false
      // Depth-1 pages are usually landing pages - keep only long, article-like
      // slugs, so root-level blog posts survive but "/features" doesn't.
      if (segs.length === 1 && segs[0].split(/[^a-z0-9]+/i).filter(Boolean).length < 3)
        return false
    } catch {
      return false
    }
    return true
  })
}

export function filterExternalCandidates(results: Candidate[], domain: string): Candidate[] {
  const host = normalizeDomain(domain)
  return results.filter(r => {
    const h = hostOf(r.url)
    if (!h) return false
    if (h === host || h.endsWith('.' + host)) return false
    try {
      const path = new URL(r.url).pathname
      const segs = path.split('/').filter(Boolean)
      // Homepages and bare locale roots (/en/, /en-us/) aren't citations.
      if (segs.length === 0) return false
      if (segs.length === 1 && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(segs[0])) return false
    } catch {
      return false
    }
    return true
  })
}

export function groupTopicsIntoQueries(topics: string[], queryCount = 3): string[][] {
  const groups: string[][] = []
  const base = Math.floor(topics.length / queryCount)
  const extra = topics.length % queryCount
  let idx = 0
  for (let i = 0; i < queryCount; i++) {
    const size = base + (i < extra ? 1 : 0)
    if (size > 0) {
      groups.push(topics.slice(idx, idx + size))
      idx += size
    }
  }
  return groups
}

export function planInternalQueries(domain: string, topics: string[]): string[] {
  const host = normalizeDomain(domain)
  return groupTopicsIntoQueries(topics, 3).map(g => `site:${host} ${g.join(' ')}`)
}

export function planExternalQueries(topics: string[]): string[] {
  return groupTopicsIntoQueries(topics, 3).map(g => `${g.join(' ')} 2024`)
}
