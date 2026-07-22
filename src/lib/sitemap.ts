/**
 * Sitemap-based candidate gathering (internal-link path, SerpAPI-free fallback).
 * Calls /.netlify/functions/sitemap?domain=<host>, which fetches and flattens
 * the site's sitemap server-side (with <lastmod> when present). Reference and
 * marketing sections (/api/, /docs/, changelogs, events…) are excluded, then
 * every remaining article-like URL is scored - topic match at word level,
 * content-section boost, recency - and handed to the ranker with a
 * slug-derived title and real date, so it isn't picking from bare URLs.
 */

import { authedFetch } from './settings'
import type { Candidate } from './pipeline/types'

const ENDPOINT = '/.netlify/functions/sitemap'

/** Pages that can never serve as citable internal links - dropped outright. */
const HARD_EXCLUSIONS = [
  '/tag/',
  '/category/',
  '/categories/',
  '/author/',
  '/authors/',
  '/search',
  '/page/',
  '/privacy',
  '/terms',
  '/legal',
  '/cookie',
  '/careers',
  '/jobs',
  '/contact',
  '/pricing',
  '/login',
  '/signup',
  '/sign-up',
]

/** Editorial sections - a link here is what the user actually wants to cite. */
const CONTENT_SECTIONS = [
  '/blog/',
  '/articles/',
  '/article/',
  '/resources/',
  '/resource/',
  '/guides/',
  '/guide/',
  '/learn/',
  '/academy/',
  '/news/',
  '/insights/',
  '/post/',
  '/posts/',
  '/stories/',
  '/tutorials/',
  '/tutorial/',
  '/library/',
  '/case-studies/',
  '/case-study/',
]

/** Reference/marketing sections (API refs, changelogs, event pages, store
 *  listings…) - excluded outright: a strong topic match on an /api/ page is
 *  still not a citable article, which was the original failure mode. */
const NON_EDITORIAL_SECTIONS = [
  '/api/',
  '/apis/',
  '/docs/',
  '/documentation/',
  '/reference/',
  '/change-log/',
  '/changelog/',
  '/release-notes/',
  '/releases/',
  '/events/',
  '/event/',
  '/webinar',
  '/integrations/',
  '/integration/',
  '/plugins/',
  '/marketplace/',
  '/templates/',
  '/store/',
  '/apps/',
  '/product/',
  '/products/',
  '/solutions/',
]

/**
 * Slug words that appear on virtually every page of the sites we search, so a
 * match on them alone says nothing about topical relevance ("google" matching
 * every /api/google-*-api page was the original failure mode).
 */
const GENERIC_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'your',
  'what',
  'how',
  'why',
  'best',
  'top',
  'free',
  'new',
  'get',
  'use',
  'using',
  'online',
  'web',
  'www',
  'com',
  'app',
  'apps',
  'api',
  'apis',
  'data',
  'google',
])

const MAX_CANDIDATES = 60
const MATCH_TARGET = 8
const RECENT_MONTHS = 24
const STALE_YEARS = 4

interface SitemapEntry {
  url: string
  lastmod: string | null
}

/** True when a URL could plausibly be a citable page (not homepage/junk). */
function isArticleUrl(url: string): boolean {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return false
  }
  if (path === '/' || path === '') return false
  const lower = path.toLowerCase()
  if (HARD_EXCLUSIONS.some(p => lower.includes(p))) return false
  if (NON_EDITORIAL_SECTIONS.some(p => lower.includes(p))) return false
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return false
  // Depth-1 pages are usually landing pages - keep only long, article-like
  // slugs ("how-to-scrape-google-search"), not "/features".
  if (segs.length === 1 && wordsOf(segs[0]).length < 3) return false
  return true
}

/** Lowercased alphanumeric words of a path or slug segment. */
function wordsOf(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** Word-level match with light plural folding ("guide" == "guides"). */
function wordMatch(a: string, b: string): boolean {
  return a === b || a === b + 's' || b === a + 's'
}

interface TopicTokens {
  topic: string
  /** All tokens (>= 3 chars) - used for exact-phrase detection. */
  all: string[]
  /** Tokens that actually discriminate (not generic, not the site's own brand). */
  discriminating: string[]
}

function tokenizeTopics(topics: string[], domain: string): TopicTokens[] {
  // The domain's own labels ("apify" on apify.com) match every branded slug,
  // so they carry no signal on their own site.
  const brandTokens = new Set(wordsOf(domain))
  return topics.map(topic => {
    const all = wordsOf(topic).filter(t => t.length >= 3)
    const discriminating = all.filter(t => !GENERIC_TOKENS.has(t) && !brandTokens.has(t))
    return { topic, all, discriminating }
  })
}

/** True when `words` contains all of `tokens` consecutively (the topic phrase). */
function hasPhrase(words: string[], tokens: string[]): boolean {
  if (tokens.length === 0 || words.length < tokens.length) return false
  outer: for (let i = 0; i <= words.length - tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (!wordMatch(words[i + j], tokens[j])) continue outer
    }
    return true
  }
  return false
}

/**
 * Match strength of a slug against one topic:
 *   3 = full topic phrase in the slug
 *   2 = >= 2 discriminating tokens (or the topic's single discriminating token)
 *   1 = 1 of several discriminating tokens
 *   0 = no discriminating signal
 */
function matchStrength(slugWords: string[], t: TopicTokens): number {
  if (t.all.length >= 2 && hasPhrase(slugWords, t.all)) return 3
  const hits = t.discriminating.filter(tok => slugWords.some(w => wordMatch(w, tok))).length
  if (hits >= 2) return 2
  if (hits === 1) return t.discriminating.length === 1 ? 2 : 1
  return 0
}

function sectionScore(path: string): number {
  return CONTENT_SECTIONS.some(p => path.toLowerCase().includes(p)) ? 2 : 0
}

function safeSectionScore(url: string): number {
  try {
    return sectionScore(new URL(url).pathname)
  } catch {
    return 0
  }
}

function recencyScore(lastmod: string | null): number {
  if (!lastmod) return 0
  const d = new Date(lastmod)
  if (Number.isNaN(d.getTime())) return 0
  const now = new Date()
  const recent = new Date(now)
  recent.setMonth(recent.getMonth() - RECENT_MONTHS)
  if (d >= recent) return 1
  const stale = new Date(now)
  stale.setFullYear(stale.getFullYear() - STALE_YEARS)
  if (d < stale) return -1
  return 0
}

/** "how-to-scrape-google-search" -> "How to scrape google search". */
function titleFromSlug(url: string): string {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean)
    const last = decodeURIComponent(segs[segs.length - 1] || '')
    const words = last.replace(/\.(html?|php|aspx?)$/i, '').split(/[-_]+/).filter(Boolean)
    if (!words.length) return ''
    const s = words.join(' ')
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch {
    return ''
  }
}

/**
 * Fetch sitemap URLs for `domain`, score every article-like URL (topic match ×2
 * + content-section boost + recency), and return
 * the top 60 as Candidates carrying a slug-derived title and lastmod date. If
 * fewer than ~8 match topically, recent editorial pages are appended as
 * '(other)' so downstream ranking has material to work with.
 *
 * Throws Error('no usable sitemap') when the function returns no usable urls,
 * so the caller can fall back to the SerpAPI path.
 */
export async function fetchSitemapCandidates(
  domain: string,
  topics: string[],
  signal?: AbortSignal,
): Promise<Candidate[]> {
  const res = await authedFetch(`${ENDPOINT}?domain=${encodeURIComponent(domain)}`, {
    method: 'GET',
    signal,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j?.error || j?.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  const data = (await res.json()) as {
    urls?: string[]
    entries?: SitemapEntry[]
    source?: string | null
  }
  const entries: SitemapEntry[] =
    data.entries && data.entries.length
      ? data.entries.filter(e => e && typeof e.url === 'string' && e.url.length > 0)
      : (data.urls ?? [])
          .filter(u => typeof u === 'string' && u.length > 0)
          .map(u => ({ url: u, lastmod: null }))
  if (entries.length === 0) throw new Error('no usable sitemap')

  // Dedupe + keep only article-like URLs.
  const seen = new Set<string>()
  const articles: SitemapEntry[] = []
  for (const e of entries) {
    if (!isArticleUrl(e.url)) continue
    const key = e.url.split('#')[0].replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    articles.push(e)
  }
  if (articles.length === 0) throw new Error('no usable sitemap')

  const topicTokens = tokenizeTopics(topics, domain)

  interface Scored {
    entry: SitemapEntry
    topic: string
    score: number
  }
  const matched: Scored[] = []
  const unmatched: SitemapEntry[] = []

  for (const entry of articles) {
    let path = ''
    try {
      path = new URL(entry.url).pathname
    } catch {
      continue
    }
    const slugWords = wordsOf(path)

    let bestTopic: string | null = null
    let bestStrength = 0
    for (const t of topicTokens) {
      const s = matchStrength(slugWords, t)
      if (s > bestStrength) {
        bestStrength = s
        bestTopic = t.topic
      }
    }

    const score = bestStrength * 2 + sectionScore(path) + recencyScore(entry.lastmod)
    if (bestTopic && bestStrength > 0 && score > 0) {
      matched.push({ entry, topic: bestTopic, score })
    } else {
      unmatched.push(entry)
    }
  }

  const byRecency = (a: SitemapEntry, b: SitemapEntry) => {
    const ta = a.lastmod ? new Date(a.lastmod).getTime() : 0
    const tb = b.lastmod ? new Date(b.lastmod).getTime() : 0
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
  }
  matched.sort((a, b) => b.score - a.score || byRecency(a.entry, b.entry))

  const out = matched.slice(0, MAX_CANDIDATES).map(s => makeCandidate(s.entry, s.topic))

  // Top up with recent pages (content sections first) when too few matched -
  // reference/marketing pages were already excluded by isArticleUrl.
  if (out.length < MATCH_TARGET) {
    const fillers = [...unmatched].sort((a, b) => {
      const sa = safeSectionScore(a.url)
      const sb = safeSectionScore(b.url)
      return sb - sa || byRecency(a, b)
    })
    for (const e of fillers) {
      if (out.length >= MAX_CANDIDATES) break
      out.push(makeCandidate(e, '(other)'))
    }
  }
  return out.slice(0, MAX_CANDIDATES)
}

function makeCandidate(entry: SitemapEntry, sourceTopic: string): Candidate {
  return {
    url: entry.url,
    title: titleFromSlug(entry.url),
    snippet: '',
    date: entry.lastmod || '',
    position: 0,
    sourceTopic,
  }
}
