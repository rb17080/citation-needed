/**
 * SerpAPI proxy — classic Netlify Node function.
 *
 * GET only. The SerpAPI key rides as the `x-serp-key` request header (never in
 * the query string the browser builds); we inject it into the upstream URL
 * server-side. The key is never logged or persisted.
 */

import type { Handler } from '@netlify/functions'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-serp-key',
}

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const key = event.headers['x-serp-key']
  if (!key) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'SerpAPI key not set' }) }
  }

  const params = event.queryStringParameters || {}
  const q = params.q
  if (!q) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing query param: q' }) }
  }

  const engine = params.engine || 'google'
  const num = params.num || '25'

  const upstreamUrl = new URL('https://serpapi.com/search.json')
  upstreamUrl.searchParams.set('q', q)
  upstreamUrl.searchParams.set('api_key', key)
  upstreamUrl.searchParams.set('engine', engine)
  upstreamUrl.searchParams.set('num', num)
  if (params.tbs) upstreamUrl.searchParams.set('tbs', params.tbs)
  if (params.gl) upstreamUrl.searchParams.set('gl', params.gl)
  if (params.hl) upstreamUrl.searchParams.set('hl', params.hl)

  try {
    const upstream = await fetch(upstreamUrl.toString())
    const text = await upstream.text()
    return {
      statusCode: upstream.status,
      headers: JSON_HEADERS,
      body: text,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SerpAPI request failed'
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: message }) }
  }
}
