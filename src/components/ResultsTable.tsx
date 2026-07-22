import { useState } from 'react'
import type { LinkRow, LinkKind } from '../lib/types'
import { compact } from '../lib/format'
import { DrMeter } from './DrMeter'
import { HealthBadge } from './HealthBadge'

type SortKey = 'default' | 'dr' | 'traffic' | 'rd'

interface Props {
  title: string
  kind: LinkKind
  rows: LinkRow[]
  scoring?: boolean
  drFloor?: number
  canRegen?: boolean
  onRegen?: (originalIndex: number) => Promise<void>
  /** URL of a row that was just swapped in - it gets the replace-flash animation. */
  flashUrl?: string | null
}

function nullableCompare(a: number | null | undefined, b: number | null | undefined): number {
  return (a == null ? -Infinity : a) - (b == null ? -Infinity : b)
}

/** Strip protocol + www + trailing slash for a compact, readable URL. */
function cleanUrl(u: string): string {
  return u
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

export function ResultsTable({ title, kind, rows, scoring, drFloor = 0, canRegen, onRegen, flashUrl }: Props) {
  const external = kind === 'external'
  // Default to pipeline order (Claude's relevance ranking) - DR-descending as
  // the default parked giant-site homepages at rank 1. DR stays sortable.
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  let display = rows.map((row, originalIndex) => ({ row, originalIndex }))
  if (external && drFloor > 0) {
    display = display.filter(({ row }) => {
      const dr = row.metrics?.domainRating
      return dr == null || dr >= drFloor
    })
  }
  if (external && sortKey !== 'default') {
    display = [...display].sort((a, b) => {
      const pick = (r: LinkRow) =>
        sortKey === 'dr'
          ? r.metrics?.domainRating
          : sortKey === 'traffic'
            ? r.metrics?.orgTraffic
            : r.metrics?.refdomains
      const cmp = nullableCompare(pick(a.row), pick(b.row))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  const caret = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  async function copyUrls() {
    try {
      await navigator.clipboard.writeText(display.map(d => d.row.url).join('\n'))
    } catch {
      /* best-effort */
    }
  }
  async function copyCsv() {
    const header = external ? 'url,domain_rating,org_traffic,referring_domains' : 'url'
    const lines = display.map(({ row }) =>
      external
        ? [row.url, row.metrics?.domainRating ?? '', row.metrics?.orgTraffic ?? '', row.metrics?.refdomains ?? ''].join(',')
        : row.url,
    )
    try {
      await navigator.clipboard.writeText([header, ...lines].join('\n'))
    } catch {
      /* best-effort */
    }
  }

  const baseCols = external ? '26px minmax(0,1fr) 164px 62px 52px 54px' : '26px minmax(0,1fr) 150px 58px'
  const cols = canRegen ? baseCols + ' 28px' : baseCols

  return (
    <fieldset style={{ marginTop: 12 }}>
      <legend>
        {title} ({display.length})
      </legend>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button onClick={copyUrls} disabled={!display.length} style={{ minWidth: 0, padding: '2px 8px' }}>
          Copy URLs
        </button>
        <button onClick={copyCsv} disabled={!display.length} style={{ minWidth: 0, padding: '2px 8px' }}>
          Export CSV
        </button>
        {scoring && external && (
          <span style={{ marginLeft: 'auto', alignSelf: 'center', color: '#808080' }}>scoring...</span>
        )}
      </div>

      <div className="listview" style={{ maxHeight: 320 }}>
        <div className="lv-head" style={{ display: 'grid', gridTemplateColumns: cols, position: 'sticky', top: 0 }}>
          <span style={{ textAlign: 'right' }}>#</span>
          <span>Source</span>
          {external ? (
            <>
              <span onClick={() => toggleSort('dr')}>DR{caret('dr')}</span>
              <span onClick={() => toggleSort('traffic')} style={{ textAlign: 'right' }}>
                Traffic{caret('traffic')}
              </span>
              <span onClick={() => toggleSort('rd')} style={{ textAlign: 'right' }}>
                Ref{caret('rd')}
              </span>
              <span>Status</span>
            </>
          ) : (
            <>
              <span>Topic</span>
              <span>Status</span>
            </>
          )}
          {canRegen && <span />}
        </div>

        {display.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#808080' }}>
            {drFloor > 0 ? 'No links meet the DR floor.' : 'Links will appear here as they are ranked.'}
          </div>
        ) : (
          display.map(({ row, originalIndex }, i) => (
            <Row
              key={`${originalIndex}-${row.url}`}
              cols={cols}
              row={row}
              rank={i + 1}
              external={external}
              scoring={scoring}
              canRegen={canRegen}
              onRegen={onRegen ? () => onRegen(originalIndex) : undefined}
              flash={!!flashUrl && row.url === flashUrl}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: 5, fontSize: 11, color: '#404040' }}>
        {external
          ? 'DR / traffic / ref. domains from Ahrefs (domain-level). Health + date fetched live.'
          : 'Internal pages from the site sitemap. Health + date fetched live.'}
      </div>
    </fieldset>
  )
}

function Row({
  cols,
  row,
  rank,
  external,
  scoring,
  canRegen,
  onRegen,
  flash,
}: {
  cols: string
  row: LinkRow
  rank: number
  external: boolean
  scoring?: boolean
  canRegen?: boolean
  onRegen?: () => Promise<void>
  flash?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const m = row.metrics

  async function replace() {
    if (busy || !onRegen) return
    setBusy(true)
    setErr(null)
    try {
      await onRegen()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Regen failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className={'lv-row' + (flash ? ' lv-row-flash' : '')}
        style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center' }}
      >
        <span style={{ textAlign: 'right', color: '#808080' }}>{rank}</span>
        <span className="lv-source">
          <a className="lv-src-title" href={row.url} target="_blank" rel="noopener noreferrer" title={row.url}>
            {row.title?.trim() || cleanUrl(row.url)}
          </a>
          {row.title?.trim() ? <span className="lv-src-url">{cleanUrl(row.url)}</span> : null}
        </span>
        {external ? (
          <>
            <span>
              <DrMeter value={m?.domainRating} />
            </span>
            <span style={{ textAlign: 'right' }}>{m ? compact(m.orgTraffic) : scoring ? '...' : '--'}</span>
            <span style={{ textAlign: 'right', color: '#404040' }}>{m ? compact(m.refdomains) : scoring ? '...' : '--'}</span>
            <span>
              <HealthBadge health={row.health} checking={scoring && !row.health} />
            </span>
          </>
        ) : (
          <>
            <span>{row.sourceTopic && row.sourceTopic !== '(other)' ? row.sourceTopic : '--'}</span>
            <span>
              <HealthBadge health={row.health} checking={scoring && !row.health} />
            </span>
          </>
        )}
        {canRegen && (
          <span style={{ textAlign: 'center' }}>
            <button
              onClick={replace}
              disabled={busy}
              title="Replace this link with the next-best candidate"
              aria-label="Replace this link"
              style={{ minWidth: 0, padding: '0 5px', lineHeight: '17px' }}
            >
              {busy ? '.' : '×'}
            </button>
          </span>
        )}
      </div>
      {err && <div style={{ color: '#800000', padding: '0 8px 6px', background: '#fff' }}>{err}</div>}
    </>
  )
}
