/**
 * Link health — classic Netlify Node function (uses cheerio).
 *
 * POST { urls: string[] }. Probes each URL with a real GET (NEVER HEAD: bot-walls
 * falsely 404 a HEAD; this is a deliberate fix lifted from a page auditor).
 * Returns status, final URL, page title, and best-effort published date.
 *
 * Honesty rule: 403/429 mean "could not verify" (bot-walled), so they band as
 * 'blocked', NOT 'dead'. Only a null status (timeout / network failure) is 'dead'.
 */

import type { Handler } from '@netlify/functions'
import * as cheerio from 'cheerio'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const MAX_URLS = 50
const CONCURRENCY = 5
const FETCH_TIMEOUT_MS = 12_000

type Band = 'ok' | 'redirect' | 'error' | 'dead' | 'blocked'

interface HealthResult {
  url: string
  ok: boolean
  status: number | null
  finalUrl: string
  redirected: boolean
  title: string | null
  date: string | null
  band: Band
}

/** Bounded-concurrency map: at most `limit` workers in flight. */
async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return results
}

function bandFor(status: number | null): Band {
  if (status == null) return 'dead'
  if (status === 403 || status === 429) return 'blocked'
  if (status >= 200 && status < 300) return 'ok'
  if (status >= 300 && status < 400) return 'redirect'
  return 'error'
}

/** Normalize a date string to ISO; if invalid, return the raw input unchanged. */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return trimmed
  return d.toISOString()
}

/** Walk a JSON-LD value (object / array / @graph) for the first datePublished. */
function findDatePublished(node: unknown): string | null {
  if (node == null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findDatePublished(item)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.datePublished === 'string' && obj.datePublished.trim()) {
      return obj.datePublished
    }
    if (obj['@graph']) {
      const found = findDatePublished(obj['@graph'])
      if (found) return found
    }
    return null
  }
  return null
}

function extractDate($: cheerio.CheerioAPI): string | null {
  // 1. JSON-LD datePublished (handles @graph + arrays of blocks).
  const scripts = $('script[type="application/ld+json"]')
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).contents().text() || $(scripts[i]).text()
    if (!raw || !raw.trim()) continue
    try {
      const parsed = JSON.parse(raw)
      const found = findDatePublished(parsed)
      if (found) return found
    } catch {
      /* malformed JSON-LD block — skip it */
    }
  }

  // 2. <meta property="article:published_time">
  const metaPublished = $('meta[property="article:published_time"]').attr('content')
  if (metaPublished && metaPublished.trim()) return metaPublished

  // 3. First <time datetime="...">
  const timeAttr = $('time[datetime]').first().attr('datetime')
  if (timeAttr && timeAttr.trim()) return timeAttr

  return null
}

async function probe(url: string): Promise<HealthResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    // GET, never HEAD — bot-walls falsely 404 HEAD requests.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })

    const status = res.status
    const finalUrl = res.url || url
    const redirected = res.redirected || finalUrl !== url
    const ok = status >= 200 && status < 400

    let title: string | null = null
    let date: string | null = null

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('html') || contentType.includes('xml')) {
      try {
        const html = await res.text()
        const $ = cheerio.load(html)
        title = $('title').first().text().trim() || null
        date = normalizeDate(extractDate($))
      } catch {
        /* body read / parse failed — keep title/date null but status stands */
      }
    }

    return { url, ok, status, finalUrl, redirected, title, date, band: bandFor(status) }
  } catch {
    // Timeout / DNS / connection failure — genuinely unreachable.
    return { url, ok: false, status: null, finalUrl: url, redirected: false, title: null, date: null, band: 'dead' }
  } finally {
    clearTimeout(timer)
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let urls: string[]
  try {
    const body = JSON.parse(event.body || '{}') as { urls?: unknown }
    urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const capped = urls.slice(0, MAX_URLS)
  const results = await runPool(capped, CONCURRENCY, probe)

  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(results) }
}
