/**
 * Ahrefs v3 proxy — classic Netlify Node function. The authority engine.
 *
 * POST only. The Ahrefs key rides as the `x-ahrefs-key` request header and is
 * forwarded upstream as `Authorization: Bearer <key>`. Never logged or persisted.
 *
 * Body shape: { op: 'enrich' | 'serp', ... }
 *  - enrich: batch-analysis for a list of targets (domain/url metrics).
 *  - serp:   serp-overview for a keyword (authority of the ranking SERP).
 */

import type { Handler } from '@netlify/functions'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-ahrefs-key',
}

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const BATCH_ANALYSIS_URL = 'https://api.ahrefs.com/v3/batch-analysis/batch-analysis'
const SERP_OVERVIEW_URL = 'https://api.ahrefs.com/v3/serp-overview/serp-overview'

interface EnrichTarget {
  url: string
  mode: string
  protocol: string
}

interface EnrichBody {
  op: 'enrich'
  targets: EnrichTarget[]
  select: string[]
  country?: string
}

interface SerpBody {
  op: 'serp'
  keyword: string
  country: string
  top_positions?: number
  select: string
}

type RequestBody = EnrichBody | SerpBody | { op?: string }

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const key = event.headers['x-ahrefs-key']
  if (!key) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Ahrefs key not set' }) }
  }

  let body: RequestBody
  try {
    body = JSON.parse(event.body || '{}') as RequestBody
  } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }

  try {
    if (body.op === 'enrich') {
      const { targets, select, country } = body as EnrichBody
      // No order_by: batch-analysis returns one row per target IN INPUT ORDER
      // with no index/url field, and the client maps results back by position.
      const payload: Record<string, unknown> = { select, targets }
      if (country) payload.country = country

      const upstream = await fetch(BATCH_ANALYSIS_URL, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      const text = await upstream.text()
      return { statusCode: upstream.status, headers: JSON_HEADERS, body: text }
    }

    if (body.op === 'serp') {
      const { keyword, country, top_positions, select } = body as SerpBody
      const url = new URL(SERP_OVERVIEW_URL)
      url.searchParams.set('keyword', keyword)
      url.searchParams.set('country', country)
      url.searchParams.set('select', select)
      if (top_positions != null) url.searchParams.set('top_positions', String(top_positions))

      const upstream = await fetch(url.toString(), {
        method: 'GET',
        headers: authHeaders,
      })
      const text = await upstream.text()
      return { statusCode: upstream.status, headers: JSON_HEADERS, body: text }
    }

    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'unknown op' }) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ahrefs request failed'
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: message }) }
  }
}
