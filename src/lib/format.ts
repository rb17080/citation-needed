/** Display + derivation helpers shared across the UI. */

export type Tier = 'good' | 'ok' | 'warn' | 'bad' | 'neutral'

/** Ahrefs Domain Rating -> quality tier (4-stop step function). */
export function drTier(dr: number | null | undefined): Tier {
  if (dr == null || Number.isNaN(dr)) return 'neutral'
  if (dr >= 60) return 'good'
  if (dr >= 40) return 'ok'
  if (dr >= 20) return 'warn'
  return 'bad'
}

/** Compact number: 1234 -> "1.2K", 1500000 -> "1.5M". */
export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-'
  const abs = Math.abs(n)
  if (abs < 1000) return String(Math.round(n))
  if (abs < 1_000_000) return (n / 1000).toFixed(abs < 10_000 ? 1 : 0) + 'K'
  if (abs < 1_000_000_000) return (n / 1_000_000).toFixed(abs < 10_000_000 ? 1 : 0) + 'M'
  return (n / 1_000_000_000).toFixed(1) + 'B'
}

/** Ahrefs monetary fields are USD cents - divide by 100 to display. */
export function centsToUsd(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '-'
  const usd = cents / 100
  if (usd < 1000) return '$' + Math.round(usd)
  return '$' + compact(usd)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
