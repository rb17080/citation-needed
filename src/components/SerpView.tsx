import { useState } from 'react'
import type { SerpRow } from '../lib/types'
import { serpOverview } from '../lib/ahrefs'
import { useApiKey } from '../lib/settings'
import { getDemoRun } from '../lib/demo'
import { compact, centsToUsd } from '../lib/format'
import { DrMeter } from './DrMeter'

/** SERP overview: the Google top results for a keyword, each ranking page
 *  scored by Ahrefs authority. Shows a frozen demo until an Ahrefs key is set. */
export function SerpView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const ahrefs = useApiKey('ahrefs')
  const demo = getDemoRun().serp

  const [keyword, setKeyword] = useState(demo.keyword)
  const [rows, setRows] = useState<SerpRow[]>(demo.rows)
  const [shown, setShown] = useState(demo.keyword)
  const [isDemo, setIsDemo] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup() {
    const kw = keyword.trim()
    if (!kw || loading) return
    setLoading(true)
    setError(null)
    try {
      const r = await serpOverview(kw, { top: 20 })
      setRows(r)
      setShown(kw)
      setIsDemo(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SERP lookup failed')
    } finally {
      setLoading(false)
    }
  }

  function showDemo() {
    setRows(demo.rows)
    setShown(demo.keyword)
    setKeyword(demo.keyword)
    setIsDemo(true)
    setError(null)
  }

  const cols = '26px minmax(0,1fr) 140px 64px 64px 52px'

  return (
    <div style={{ padding: 0 }}>
      <fieldset>
        <legend>SERP overview</legend>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#202020' }}>
          The Google top results for a keyword, each ranking page scored by Ahrefs authority - see who
          you're up against before you cite.
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="keyword, e.g. topical authority"
            autoComplete="off"
            spellCheck={false}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button onClick={lookup} disabled={!ahrefs.present || !keyword.trim() || loading} style={{ fontWeight: 'bold' }}>
            {loading ? 'Looking up...' : 'Look up SERP'}
          </button>
          <button onClick={showDemo} disabled={loading}>
            Sample
          </button>
        </div>
        {!ahrefs.present && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#202020' }}>
            Showing a frozen sample SERP (no key needed). For live lookups,{' '}
            <button onClick={onOpenSettings} style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }}>
              add an Ahrefs key
            </button>
            .
          </div>
        )}
        {error && (
          <div className="sunken-thin" style={{ marginTop: 10, padding: '6px 8px', color: '#800000' }}>
            {error}
          </div>
        )}
      </fieldset>

      <fieldset style={{ marginTop: 12 }}>
        <legend>
          "{shown}" - top {rows.length}
          {isDemo ? ' (sample)' : ''}
        </legend>
        <div className="listview" style={{ maxHeight: 380 }}>
          <div className="lv-head" style={{ display: 'grid', gridTemplateColumns: cols, position: 'sticky', top: 0 }}>
            <span style={{ textAlign: 'right' }}>#</span>
            <span>Ranking page</span>
            <span>DR</span>
            <span style={{ textAlign: 'right' }}>Traffic</span>
            <span style={{ textAlign: 'right' }}>Value</span>
            <span style={{ textAlign: 'right' }}>Ref</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#808080' }}>No organic results.</div>
          ) : (
            rows.map((r, i) => (
              <div key={i} className="lv-row" style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center' }}>
                <span style={{ textAlign: 'right', color: '#808080' }}>{r.position}</span>
                <span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}>
                    {r.title || r.url}
                  </a>
                </span>
                <span>
                  <DrMeter value={r.domainRating} />
                </span>
                <span style={{ textAlign: 'right' }}>{compact(r.traffic)}</span>
                <span style={{ textAlign: 'right' }}>{centsToUsd(r.value)}</span>
                <span style={{ textAlign: 'right', color: '#404040' }}>{compact(r.refdomains)}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 5, fontSize: 11, color: '#404040' }}>
          Organic positions from Ahrefs serp-overview (gaps = ads / SERP features). Metrics are page-level.
        </div>
      </fieldset>
    </div>
  )
}
