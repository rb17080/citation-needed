/**
 * Safe demo mode: replay a frozen real run (real links, real Ahrefs scores)
 * with no keys and no API calls. The replay drives the SAME callbacks the live
 * pipeline uses, so the UI code path is identical - only the data source differs.
 */
import type { LinkRow, SerpRow, HealthResult } from './types'
import { demoRun } from '../data/demoRun'

export interface DemoRun {
  domain: string
  articleTitle: string
  articleExcerpt: string
  /** Full article text, so "Paste text" is pre-filled in demo mode. */
  articleText: string
  topics: string[]
  internal: LinkRow[]
  external: LinkRow[]
  /** Frozen replacement pool so reject/replace works in demo mode too -
   *  real links with real metrics, mirroring the live candidate pool. */
  spares: { internal: LinkRow[]; external: LinkRow[] }
  serp: { keyword: string; rows: SerpRow[] }
}

// Every URL in the frozen run was probed 200 OK (no redirects) on the
// generation date - see demoRun.ts.
function demoHealth(url: string): HealthResult {
  return {
    url,
    ok: true,
    status: 200,
    finalUrl: url,
    redirected: false,
    title: null,
    date: null,
    band: 'ok',
  }
}

export function getDemoRun(): DemoRun {
  const withHealth = (rows: LinkRow[]) => rows.map(r => ({ ...r, health: r.health ?? demoHealth(r.url) }))
  return {
    ...demoRun,
    internal: withHealth(demoRun.internal),
    external: withHealth(demoRun.external),
    spares: {
      internal: withHealth(demoRun.spares.internal),
      external: withHealth(demoRun.spares.external),
    },
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

export interface ReplayCallbacks {
  onLog: (text: string, kind?: 'info' | 'search' | 'result' | 'done' | 'error') => void
  onTopics: (topics: string[]) => void
  onRow: (row: LinkRow) => void
}

/**
 * Walks the frozen run, emitting log lines and rows on a gentle cadence so it
 * looks and feels like a live search. Abortable. Pure timing - no network.
 */
export async function replayDemoRun(
  run: DemoRun,
  cb: ReplayCallbacks,
  signal: AbortSignal,
  speed = 1,
): Promise<void> {
  const d = (ms: number) => sleep(ms / speed, signal)

  cb.onLog(`Starting research for domain: ${run.domain}`, 'info')
  await d(220)
  cb.onLog(`Article length: ${run.articleText.length} chars`, 'info')
  await d(180)
  cb.onLog('Mode: cached run - no keys, no API calls', 'info')
  await d(260)

  cb.onLog('Phase 0: extracting search topics (Haiku 4.5)', 'info')
  await d(420)
  cb.onTopics(run.topics)
  cb.onLog(`Topics: ${run.topics.join(' · ')}`, 'info')
  await d(320)

  cb.onLog('Phase 1: internal candidates from sitemap', 'info')
  await d(300)
  for (const row of run.internal) {
    cb.onRow(row)
    await d(150)
  }
  cb.onLog(`  → ${run.internal.length} internal links selected`, 'result')
  await d(260)

  cb.onLog('Phase 2: external candidates + Ahrefs authority enrichment', 'info')
  await d(300)
  for (const row of run.external) {
    cb.onRow(row)
    await d(150)
  }
  cb.onLog(`  → ${run.external.length} external links selected and scored`, 'result')
  await d(200)
  cb.onLog('Run complete', 'done')
}
