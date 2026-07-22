import type { HealthResult } from '../lib/types'

const LABEL: Record<HealthResult['band'], { text: string; color: string }> = {
  ok: { text: 'OK', color: '#008000' },
  redirect: { text: 'redir', color: '#808000' },
  blocked: { text: 'blocked', color: '#808000' },
  error: { text: 'error', color: '#800000' },
  dead: { text: 'dead', color: '#800000' },
}

/** Link-health status. "blocked" = bot-walled (could not verify), never "dead". */
export function HealthBadge({
  health,
  checking,
}: {
  health?: HealthResult | null
  checking?: boolean
}) {
  if (checking) return <span style={{ color: '#808080' }}>...</span>
  if (!health) return <span style={{ color: '#808080' }}>--</span>
  const m = LABEL[health.band] ?? LABEL.error
  const title =
    (health.status ? `HTTP ${health.status}` : 'no response') +
    (health.redirected ? ' (redirected)' : '') +
    (health.band === 'blocked' ? ' (bot-protected, could not verify)' : '')
  return (
    <span style={{ color: m.color }} title={title}>
      {m.text}
    </span>
  )
}
