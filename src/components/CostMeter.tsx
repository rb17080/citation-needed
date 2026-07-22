/**
 * Live spend estimate. Sums streamed token usage per model and prices each at
 * its own public Anthropic rate. Estimate only, not a billing figure.
 */

interface ModelTokens {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
}
export type CostState = Record<string, ModelTokens>

const PRICING: Record<string, ModelTokens> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1, cacheCreate: 1.25 },
}
const FALLBACK: ModelTokens = { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 }

export function emptyCost(): CostState {
  return {}
}

export function addUsage(
  state: CostState,
  u: {
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
  },
): CostState {
  const cur = state[u.model] ?? { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }
  return {
    ...state,
    [u.model]: {
      input: cur.input + (u.inputTokens || 0),
      output: cur.output + (u.outputTokens || 0),
      cacheRead: cur.cacheRead + (u.cacheReadTokens || 0),
      cacheCreate: cur.cacheCreate + (u.cacheCreationTokens || 0),
    },
  }
}

export function costOf(state: CostState): number {
  let total = 0
  for (const [model, t] of Object.entries(state)) {
    const p = PRICING[model] ?? FALLBACK
    total +=
      (t.input * p.input +
        t.output * p.output +
        t.cacheRead * p.cacheRead +
        t.cacheCreate * p.cacheCreate) /
      1_000_000
  }
  return total
}

function fmt(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return '$' + usd.toFixed(4)
  return '$' + usd.toFixed(3)
}

/** A status-bar panel showing estimated spend. Renders nothing until there is spend. */
export function CostMeter({ cost }: { cost: CostState }) {
  const models = Object.keys(cost)
  if (!models.length) return null
  const total = costOf(cost)
  const breakdown = models
    .map(m => {
      const short = m.includes('haiku') ? 'Haiku' : m.includes('sonnet') ? 'Sonnet' : m
      const t = cost[m]
      return `${short}: ${(t.input + t.cacheRead + t.cacheCreate).toLocaleString()} in / ${t.output.toLocaleString()} out`
    })
    .join('\n')
  return <span title={`Estimated, not billed.\n${breakdown}`}>est. {fmt(total)}</span>
}
