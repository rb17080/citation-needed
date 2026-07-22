/**
 * Ahrefs client. Calls our own serverless proxy at /.netlify/functions/ahrefs,
 * which forwards to the Ahrefs API server-side (the user's key rides as the
 * x-ahrefs-key header attached by authedFetch, never in the URL or body).
 *
 * Note: Ahrefs monetary fields (e.g. SERP `value`) are USD CENTS. We pass them
 * through unchanged - formatting to dollars happens in the UI (centsToUsd).
 */

import { authedFetch } from './settings'
import { hostOf } from './format'
import type { AhrefsMetrics, SerpRow } from './types'

const ENDPOINT = '/.netlify/functions/ahrefs'

/** Coerce an unknown numeric-ish field to number | null. */
function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function errorFrom(res: Response): Promise<Error> {
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = j?.error || j?.message || msg
  } catch {
    /* ignore */
  }
  return new Error(msg)
}

interface EnrichTarget {
  url: string
  // Ahrefs guidance: analyzing a bare domain needs `subdomains` - `domain`
  // mode silently excludes www and other subdomains, undercounting metrics.
  mode: 'subdomains'
  protocol: 'both'
}

interface EnrichResponseRow {
  domain_rating?: number | null
  url_rating?: number | null
  org_traffic?: number | null
  refdomains?: number | null
  ahrefs_rank?: number | null
}

/**
 * Enrich a batch of external URLs with domain-level Ahrefs metrics.
 * Returns a Map keyed by hostOf(inputUrl) -> AhrefsMetrics.
 *
 * batch-analysis returns one row per target IN INPUT ORDER (no `index`/`url`
 * field in the row), so rows are mapped back to their input URL by position.
 */
export async function enrichExternal(
  urls: string[],
  opts?: { country?: string; signal?: AbortSignal },
): Promise<Map<string, AhrefsMetrics>> {
  const out = new Map<string, AhrefsMetrics>()
  if (urls.length === 0) return out

  const targets: EnrichTarget[] = urls.map(u => ({ url: u, mode: 'subdomains', protocol: 'both' }))
  const select = ['domain_rating', 'url_rating', 'org_traffic', 'refdomains', 'ahrefs_rank']
  const country = opts?.country ?? 'us'

  const res = await authedFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'enrich', targets, select, country }),
    signal: opts?.signal,
  })
  if (!res.ok) throw await errorFrom(res)

  const data = (await res.json()) as { targets?: EnrichResponseRow[] }
  const rows = data.targets ?? []
  rows.forEach((row, i) => {
    const inputUrl = urls[i]
    if (inputUrl == null) return
    const host = hostOf(inputUrl)
    if (!host) return
    out.set(host, {
      domainRating: num(row.domain_rating),
      urlRating: num(row.url_rating),
      orgTraffic: num(row.org_traffic),
      refdomains: num(row.refdomains),
      ahrefsRank: num(row.ahrefs_rank),
    })
  })
  return out
}

interface SerpResponseRow {
  position?: number
  url?: string
  title?: string
  domain_rating?: number | null
  url_rating?: number | null
  traffic?: number | null
  value?: number | null
  refdomains?: number | null
  backlinks?: number | null
  type?: string[]
}

/**
 * Ahrefs SERP overview for a keyword. Keeps only organic positions and maps
 * to camelCase SerpRow, sorted by position ascending. `value` stays in cents.
 */
export async function serpOverview(
  keyword: string,
  opts?: { country?: string; top?: number },
): Promise<SerpRow[]> {
  const res = await authedFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      op: 'serp',
      keyword,
      country: opts?.country ?? 'us',
      top_positions: opts?.top ?? 20,
      select: 'position,url,title,domain_rating,url_rating,traffic,value,refdomains,backlinks,type',
    }),
  })
  if (!res.ok) throw await errorFrom(res)

  const data = (await res.json()) as { positions?: SerpResponseRow[] }
  const rows = data.positions ?? []
  return rows
    .filter(r => Array.isArray(r.type) && r.type.includes('organic'))
    .map<SerpRow>(r => ({
      position: num(r.position) ?? 0,
      url: r.url ?? '',
      title: r.title ?? '',
      domainRating: num(r.domain_rating),
      urlRating: num(r.url_rating),
      traffic: num(r.traffic),
      value: num(r.value),
      refdomains: num(r.refdomains),
      backlinks: num(r.backlinks),
    }))
    .sort((a, b) => a.position - b.position)
}
