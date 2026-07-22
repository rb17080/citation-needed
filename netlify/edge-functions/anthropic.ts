/**
 * Anthropic proxy — Netlify Edge Function (Deno-style runtime).
 *
 * Serves /api/anthropic (wired in netlify.toml). The browser never holds the
 * Anthropic key in a URL; it rides as the `x-anthropic-key` request header,
 * which we forward upstream as `x-api-key`. The user's key is never logged or
 * persisted.
 *
 * CRITICAL: we STREAM the upstream body straight through
 * (`new Response(upstream.body, ...)`). Buffering it with `await upstream.text()`
 * would break SSE streaming — do not reintroduce that.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-anthropic-key',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  const key = req.headers.get('x-anthropic-key')
  if (!key) {
    return new Response('Missing Anthropic key', { status: 400, headers: CORS_HEADERS })
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: await req.text(),
  })

  // Pass the upstream body through unbuffered so SSE streaming survives.
  const headers = new Headers(CORS_HEADERS)
  const contentType = upstream.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) headers.set('retry-after', retryAfter)

  return new Response(upstream.body, { status: upstream.status, headers })
}
