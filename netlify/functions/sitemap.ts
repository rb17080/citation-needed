/**
 * Sitemap discovery — classic Netlify Node function. Internal-link discovery.
 *
 * GET ?domain=example.com. Finds a site's sitemap (robots.txt -> sitemap.xml ->
 * sitemap_index.xml), follows a sitemap index into its children, and returns
 * every <loc> URL on the domain. On total failure it returns an empty list with
 * status 200 so the client falls back to SerpAPI gracefully.
 */

import type { Handler } from '@netlify/functions'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 10_000
const MAX_CHILD_SITEMAPS = 10
const MAX_URLS = 2000

/**
 * Child sitemaps are fetched CONTENT-FIRST, not in document order. Big sites
 * list product/docs/locale sitemaps before the blog sitemap, so "first 10 in
 * order" could fill the whole URL budget without a single editorial page.
 */
const CONTENT_SITEMAP_HINTS = [
  'blog',
  'post',
  'news',
  'article',
  'stories',
  'resource',
  'guide',
  'learn',
  'insight',
  'academy',
  'tutorial',
]
const JUNK_SITEMAP_HINTS = [
  'api',
  'docs',
  'documentation',
  'reference',
  'changelog',
  'change-log',
  'release',
  'event',
  'webinar',
  'integration',
  'plugin',
  'marketplace',
  'template',
  'store',
  'product',
  'category',
  'tag',
  'author',
  'legal',
  'help',
  'video',
]

function childSitemapScore(url: string): number {
  const lower = url.toLowerCase()
  if (CONTENT_SITEMAP_HINTS.some((h) => lower.includes(h))) return 2
  if (JUNK_SITEMAP_HINTS.some((h) => lower.includes(h))) return -2
  return 0
}

function normalizeDomain(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

async function timedFetch(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string): Promise<string | null> {
  const res = await timedFetch(url)
  if (!res || !res.ok) return null
  try {
    return await res.text()
  } catch {
    return null
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function extractLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>(.*?)<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const url = decodeEntities(m[1].trim())
    if (url) out.push(url)
  }
  return out
}

interface SitemapEntry {
  url: string
  lastmod: string | null
}

/**
 * Extract <url> entries pairing <loc> with its sibling <lastmod> (recency data
 * the client uses for scoring). Falls back to a bare <loc> scan for sitemaps
 * with unusual formatting.
 */
function extractEntries(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = []
  const blockRe = /<url[\s>][\s\S]*?<\/url>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[0]
    const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(block)
    if (!loc) continue
    const url = decodeEntities(loc[1].trim())
    if (!url) continue
    const lm = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block)
    out.push({ url, lastmod: lm ? lm[1].trim() || null : null })
  }
  if (out.length === 0) {
    for (const url of extractLocs(xml)) out.push({ url, lastmod: null })
  }
  return out
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml) || (/<sitemap[\s>]/i.test(xml) && /<loc>/i.test(xml))
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function sitemapsFromRobots(robots: string): string[] {
  const out: string[] = []
  const re = /^\s*Sitemap:\s*(\S+)\s*$/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(robots)) !== null) {
    out.push(m[1].trim())
  }
  return out
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  const rawDomain = event.queryStringParameters?.domain
  if (!rawDomain) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing query param: domain' }) }
  }

  const domain = normalizeDomain(rawDomain)
  if (!domain) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid domain' }) }
  }

  const empty = {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ urls: [], entries: [], source: null }),
  }

  try {
    // (a) Discover candidate sitemap URLs from robots.txt.
    let sitemapUrls: string[] = []
    const robots = await fetchText(`https://${domain}/robots.txt`)
    if (robots) {
      sitemapUrls = sitemapsFromRobots(robots).filter((u) => hostOf(u).endsWith(domain))
    }

    // (b) Fall back to the conventional locations.
    const fallbacks = [`https://${domain}/sitemap.xml`, `https://${domain}/sitemap_index.xml`]
    const tryOrder = sitemapUrls.length > 0 ? sitemapUrls : fallbacks

    let winningSource: string | null = null
    let rootXml: string | null = null
    for (const candidate of tryOrder) {
      const xml = await fetchText(candidate)
      if (xml) {
        rootXml = xml
        winningSource = candidate
        break
      }
    }

    if (!rootXml || !winningSource) return empty

    const collected: SitemapEntry[] = []

    if (isSitemapIndex(rootXml)) {
      // Best-scoring children first (stable within a tier), fetched in
      // parallel; entries are collected in that same content-first order so
      // the MAX_URLS budget fills with editorial pages before anything else.
      const childSitemaps = extractLocs(rootXml)
        .filter((u) => hostOf(u).endsWith(domain))
        .map((url, i) => ({ url, i, score: childSitemapScore(url) }))
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .slice(0, MAX_CHILD_SITEMAPS)
      const childXmls = await Promise.all(childSitemaps.map((c) => fetchText(c.url)))
      for (const childXml of childXmls) {
        if (collected.length >= MAX_URLS) break
        if (childXml) collected.push(...extractEntries(childXml))
      }
    } else {
      collected.push(...extractEntries(rootXml))
    }

    const seen = new Set<string>()
    const entries: SitemapEntry[] = []
    for (const e of collected) {
      if (entries.length >= MAX_URLS) break
      if (!hostOf(e.url).endsWith(domain)) continue
      if (seen.has(e.url)) continue
      seen.add(e.url)
      entries.push(e)
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      // `urls` kept alongside `entries` so an older cached client build keeps working.
      body: JSON.stringify({ urls: entries.map((e) => e.url), entries, source: winningSource }),
    }
  } catch {
    return empty
  }
}
