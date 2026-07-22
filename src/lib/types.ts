/** App-level types layered on top of the pipeline (Ahrefs, link-health, history). */
import type { Candidate, LinkKind } from './pipeline/types'

/** Ahrefs metrics for one domain/url (from batch-analysis). */
export interface AhrefsMetrics {
  domainRating: number | null
  urlRating: number | null
  orgTraffic: number | null
  refdomains: number | null
  ahrefsRank: number | null
}

/** A link-health probe result (from the link-health function, SEOdin-derived). */
export interface HealthResult {
  url: string
  ok: boolean
  status: number | null
  finalUrl: string
  redirected: boolean
  title: string | null
  date: string | null
  /** ok | redirect | error | dead | blocked (bot-walled, can't verify) */
  band: 'ok' | 'redirect' | 'error' | 'dead' | 'blocked'
}

/** A fully-resolved result row in the UI (URL + optional enrichment). */
export interface LinkRow {
  url: string
  kind: LinkKind
  metrics?: AhrefsMetrics | null // external only
  health?: HealthResult | null
  date?: string | null
  title?: string | null
  sourceTopic?: string | null
}

/** A SERP-overview row (from Ahrefs serp-overview). */
export interface SerpRow {
  position: number
  url: string
  title: string
  domainRating: number | null
  urlRating: number | null
  traffic: number | null
  value: number | null // USD cents
  refdomains: number | null
  backlinks: number | null
}

/** A saved run (localStorage history). */
export interface SavedRun {
  id: string
  createdAt: number
  domain: string
  topics: string[]
  internal: LinkRow[]
  external: LinkRow[]
  note?: string
}

export type { Candidate, LinkKind }
