/**
 * Shared pipeline types (topic extraction -> SERP -> rank -> stream).
 */

export type LinkKind = 'internal' | 'external'

export interface Candidate {
  url: string
  title: string
  snippet: string
  date: string
  position: number
  sourceTopic?: string
}

export type LogKind = 'info' | 'search' | 'result' | 'done' | 'error'

export interface LogEntry {
  text: string
  kind: LogKind
}

export interface UsagePayload {
  input: number
  cacheRead: number
  cacheCreate: number
  output: number
  phase: 'start' | 'final'
}

export interface PipelineCallbacks {
  onLog: (text: string, kind?: LogKind) => void
  /** Emits a selected URL. `meta` carries the candidate's source topic + title
   *  (when known) so the UI can label internal links by topic. */
  onUrl: (url: string, kind: LinkKind, meta?: { sourceTopic?: string; title?: string }) => void
  onTopics?: (topics: string[]) => void
  onPools?: (internal: Candidate[], external: Candidate[]) => void
  /**
   * Per-Anthropic-call usage. Fires at the end of each pipeline call so a
   * CostMeter can sum spend in real time. Includes the model so the meter
   * prices Haiku at Haiku rates and Sonnet at Sonnet rates.
   */
  onUsage?: (u: {
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
  }) => void
}

export interface RunOptions {
  /** Whether the user has a SerpAPI key saved. Controls which candidate-
   *  gathering path runs (SerpAPI primary vs. web_search fallback). */
  hasSerpKey: boolean
  model: string
  domain: string
  article: string
  customPrompt: string
  abortSignal: AbortSignal
  callbacks: PipelineCallbacks
  /**
   * Optional injected internal-candidate provider (sitemap-based). When given,
   * the SerpAPI flow uses it for internal links and only falls back to a
   * `site:` search if it throws or returns nothing. Injected (not imported) so
   * the pipeline stays free of any network/transport coupling.
   */
  getInternalCandidates?: (
    domain: string,
    topics: string[],
    signal: AbortSignal,
  ) => Promise<Candidate[]>
}
