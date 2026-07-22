/**
 * Anthropic client. Two entry points:
 * - extractTopics: single non-streaming Haiku call (5 keywords)
 * - callAnthropicStreaming: SSE-parsed streaming call, optionally with the
 *   web_search tool
 *
 * Both route through the serverless proxy at /api/anthropic, which attaches the
 * user's BYO Anthropic key (sent as a request header) and streams the upstream
 * response body straight back.
 *
 * Includes 429 retry with Retry-After honored (up to 3 attempts).
 */

import { authedFetch } from '../settings'

const API_URL = '/api/anthropic'
export const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001'
export const MAX_WEB_SEARCHES = 3
export const MAX_429_RETRIES = 3

export interface ExtractionResult {
  topics: string[]
  raw: string
  usage: { input_tokens?: number; output_tokens?: number }
}

export async function extractTopics(
  article: string,
  systemPrompt: string,
  signal: AbortSignal,
): Promise<ExtractionResult> {
  const res = await authedFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Article:\n\n' + article }],
    }),
    signal,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error?.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(`Topic extraction failed: ${msg}`)
  }
  const data = await res.json()
  const raw = (data.content?.[0]?.text || '').trim() as string
  const topics = raw
    .split(/[,\n]/)
    .map((t: string) => t.replace(/^[\-•\d.\s]+/, '').trim())
    .filter((t: string) => t.length > 0 && t.length < 80)
  return { topics, raw, usage: data.usage || {} }
}

export type SystemContent =
  | string
  | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>

export interface StreamingCallbacks {
  onTextDelta: (delta: string) => void
  onSearchQuery?: (query: string) => void
  onSearchResult?: (summary: string) => void
  onUsage?: (u: {
    input: number
    cacheRead: number
    cacheCreate: number
    output: number
    phase: 'start' | 'final'
  }) => void
}

interface CallOptions {
  model: string
  system: SystemContent
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>
  useTools: boolean
  signal: AbortSignal
  callbacks: StreamingCallbacks
  onRateLimitWait?: (waitSeconds: number, attempt: number) => void
}

export async function callAnthropicStreaming(opts: CallOptions): Promise<string | null> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 8192,
    system: opts.system,
    messages: opts.messages,
    stream: true,
  }
  if (opts.useTools) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_WEB_SEARCHES }]
  }

  let res: Response
  let attempt = 0
  while (true) {
    res = await authedFetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) break
    const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10)
    opts.onRateLimitWait?.(retryAfter, attempt + 1)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    attempt++
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error?.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  if (!res.body) throw new Error('Anthropic returned no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let currentBlockType: string | null = null
  let currentToolJson = ''
  let stopReason: string | null = null

  const { onTextDelta, onSearchQuery, onSearchResult, onUsage } = opts.callbacks

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let sep: number
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const lines = raw.split('\n')
      let evType: string | null = null
      let data: any = null
      for (const line of lines) {
        if (line.startsWith('event:')) evType = line.slice(6).trim()
        else if (line.startsWith('data:')) {
          const d = line.slice(5).trim()
          try {
            data = JSON.parse(d)
          } catch {
            data = null
          }
        }
      }
      if (!evType || !data) continue

      if (evType === 'message_start') {
        const u = data.message?.usage
        if (u && onUsage)
          onUsage({
            input: u.input_tokens || 0,
            cacheRead: u.cache_read_input_tokens || 0,
            cacheCreate: u.cache_creation_input_tokens || 0,
            output: u.output_tokens || 0,
            phase: 'start',
          })
      } else if (evType === 'content_block_start') {
        const block = data.content_block
        currentBlockType = block?.type ?? null
        currentToolJson = ''
        if (block?.type === 'web_search_tool_result' && onSearchResult) {
          const content = block.content
          if (Array.isArray(content)) {
            onSearchResult(`${content.length} result${content.length === 1 ? '' : 's'}`)
          } else if (content?.type === 'web_search_tool_result_error') {
            onSearchResult(`error: ${content.error_code || 'unknown'}`)
          }
        }
      } else if (evType === 'content_block_delta') {
        const delta = data.delta
        if (delta?.type === 'text_delta') onTextDelta(delta.text || '')
        else if (delta?.type === 'input_json_delta') currentToolJson += delta.partial_json || ''
      } else if (evType === 'content_block_stop') {
        if (currentBlockType === 'server_tool_use' && currentToolJson) {
          try {
            const parsed = JSON.parse(currentToolJson)
            if (parsed.query && onSearchQuery) onSearchQuery(parsed.query)
          } catch {
            /* ignore */
          }
        }
        currentBlockType = null
        currentToolJson = ''
      } else if (evType === 'message_delta') {
        if (data.delta?.stop_reason) stopReason = data.delta.stop_reason
        const u = data.usage
        if (u && onUsage)
          onUsage({
            input: u.input_tokens || 0,
            cacheRead: u.cache_read_input_tokens || 0,
            cacheCreate: u.cache_creation_input_tokens || 0,
            output: u.output_tokens || 0,
            phase: 'final',
          })
      } else if (evType === 'error') {
        throw new Error(data.error?.message || 'stream error')
      }
    }
  }

  return stopReason
}
