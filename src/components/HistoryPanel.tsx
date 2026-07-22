import { useState } from 'react'
import type { SavedRun } from '../lib/types'
import { listRuns, deleteRun, clearRuns } from '../lib/history'
import { ResultsTable } from './ResultsTable'

function when(ms: number): string {
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export function HistoryPanel() {
  const [runs, setRuns] = useState<SavedRun[]>(() => listRuns())
  const [openId, setOpenId] = useState<string | null>(null)

  function remove(id: string) {
    deleteRun(id)
    if (openId === id) setOpenId(null)
    setRuns(listRuns())
  }
  function clearAll() {
    clearRuns()
    setOpenId(null)
    setRuns([])
  }

  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold' }}>Saved runs ({runs.length})</span>
        {runs.length > 0 && (
          <button onClick={clearAll} style={{ marginLeft: 'auto', minWidth: 0, padding: '2px 8px' }}>
            Clear all
          </button>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="sunken" style={{ padding: 24, textAlign: 'center', color: '#808080' }}>
          No saved runs yet. Live runs are saved here automatically.
        </div>
      ) : (
        <div className="listview scroll" style={{ maxHeight: 460 }}>
          {runs.map(run => (
            <div key={run.id}>
              <div
                className="lv-row"
                style={{ display: 'grid', gridTemplateColumns: '1fr 28px', alignItems: 'center' }}
              >
                <span
                  onClick={() => setOpenId(id => (id === run.id ? null : run.id))}
                  style={{ cursor: 'pointer' }}
                  title="Open run"
                >
                  <span style={{ color: '#000080' }}>{run.domain || '--'}</span>
                  {'  '}
                  <span style={{ color: '#404040' }}>
                    {when(run.createdAt)} · {run.external.length} ext / {run.internal.length} int
                  </span>
                </span>
                <span style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => remove(run.id)}
                    title="Delete run"
                    aria-label="Delete run"
                    style={{ minWidth: 0, padding: '0 5px', lineHeight: '17px' }}
                  >
                    ×
                  </button>
                </span>
              </div>
              {openId === run.id && (
                <div style={{ padding: '4px 10px 12px', background: '#c0c0c0' }}>
                  {run.topics.length > 0 && (
                    <div style={{ fontSize: 11, color: '#202020', margin: '6px 0' }}>
                      topics: {run.topics.join(' · ')}
                    </div>
                  )}
                  <ResultsTable title="External links" kind="external" rows={run.external} />
                  <ResultsTable title="Internal links" kind="internal" rows={run.internal} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
