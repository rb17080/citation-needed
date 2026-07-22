/**
 * Link-health client. Calls /.netlify/functions/link-health, which probes each
 * URL server-side (HEAD/GET, redirect + bot-wall detection) and returns a
 * HealthResult per URL. URLs are chunked so we never blow past the function's
 * per-request budget; a failed batch is skipped rather than failing the run.
 */

import { authedFetch } from './settings'
import type { HealthResult } from './types'

const ENDPOINT = '/.netlify/functions/link-health'
const BATCH_SIZE = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function checkBatch(urls: string[], signal?: AbortSignal): Promise<HealthResult[]> {
  const res = await authedFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as HealthResult[]
  return Array.isArray(data) ? data : []
}

/**
 * Probe `urls` for link health in batches of <= 50. Returns a Map keyed by the
 * result's url -> HealthResult. Failed batches are skipped; if every batch
 * fails, an empty Map is returned (the run still succeeds, just unenriched).
 */
export async function checkLinks(
  urls: string[],
  signal?: AbortSignal,
): Promise<Map<string, HealthResult>> {
  const out = new Map<string, HealthResult>()
  if (urls.length === 0) return out

  const batches = chunk(urls, BATCH_SIZE)
  const settled = await Promise.allSettled(batches.map(b => checkBatch(b, signal)))

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    for (const row of result.value) {
      if (row && typeof row.url === 'string') out.set(row.url, row)
    }
  }
  return out
}
