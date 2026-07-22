import { useEffect, useState } from 'react'
import { getKey, setKey } from '../lib/settings'
import type { ApiKeyId } from '../lib/settings'
import { SCHEMES, getSavedColors, saveColors, OSES, getSavedOs, saveOs, type OsId } from '../lib/theme'

const FIELDS: { id: ApiKeyId; label: string; placeholder: string; help: string }[] = [
  {
    id: 'anthropic',
    label: 'Anthropic API key',
    placeholder: 'sk-ant-...',
    help: 'Required for live runs. Powers topic extraction and link ranking.',
  },
  {
    id: 'serp',
    label: 'SerpAPI key',
    placeholder: 'optional',
    help: 'Optional. Higher-quality Google candidates; otherwise Claude web search is used.',
  },
  {
    id: 'ahrefs',
    label: 'Ahrefs API key',
    placeholder: 'optional',
    help: 'Optional. Adds Domain Rating + traffic to external links.',
  },
]

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [values, setValues] = useState<Record<ApiKeyId, string>>({ anthropic: '', serp: '', ahrefs: '' })
  const [colors, setColors] = useState(() => getSavedColors())
  const [os, setOs] = useState<OsId>(() => getSavedOs())

  useEffect(() => {
    if (open) {
      setValues({ anthropic: getKey('anthropic'), serp: getKey('serp'), ahrefs: getKey('ahrefs') })
      setColors(getSavedColors())
      setOs(getSavedOs())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function save() {
    ;(Object.keys(values) as ApiKeyId[]).forEach(id => setKey(id, values[id].trim()))
    onClose()
  }

  function pickScheme(name: string) {
    const s = SCHEMES.find(x => x.name === name)
    if (!s) return
    const next = { titlebar: s.titlebar, desktop: s.desktop }
    setColors(next)
    saveColors(next.titlebar, next.desktop)
  }
  function setColor(which: 'titlebar' | 'desktop', val: string) {
    const next = { ...colors, [which]: val }
    setColors(next)
    saveColors(next.titlebar, next.desktop)
  }
  function pickOs(next: OsId) {
    setOs(next)
    saveOs(next)
  }

  const matchedScheme = SCHEMES.find(s => s.titlebar === colors.titlebar && s.desktop === colors.desktop)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8vh',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div className="window" style={{ width: 'min(460px, 94vw)' }} onClick={e => e.stopPropagation()}>
        <div className="title-bar">
          <div className="title-bar-text">Settings</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body">
          <fieldset style={{ marginBottom: 12 }}>
            <legend>Appearance</legend>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <label style={{ width: 86 }}>Theme:</label>
              <select value={os} onChange={e => pickOs(e.target.value as OsId)} style={{ flex: 1 }}>
                {OSES.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <label style={{ width: 86 }}>Color scheme:</label>
              <select value={matchedScheme?.name ?? 'Custom'} onChange={e => pickScheme(e.target.value)} style={{ flex: 1 }}>
                {!matchedScheme && <option value="Custom">Custom</option>}
                {SCHEMES.map(s => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Title bar
                <input type="color" value={colors.titlebar} onChange={e => setColor('titlebar', e.target.value)} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Desktop
                <input type="color" value={colors.desktop} onChange={e => setColor('desktop', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>API keys</legend>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#202020' }}>
              Stored only in this browser and sent directly to each provider. Never saved on a server.
            </p>
            {FIELDS.map(f => (
              <div key={f.id} style={{ marginBottom: 10 }}>
                <label htmlFor={`k-${f.id}`} style={{ display: 'block', marginBottom: 3 }}>
                  {f.label}
                  {f.id === 'anthropic' && <span style={{ color: '#800000' }}> *</span>}
                </label>
                <input
                  id={`k-${f.id}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.placeholder}
                  value={values[f.id]}
                  onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: '#404040', marginTop: 2 }}>{f.help}</div>
              </div>
            ))}
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
            <button onClick={save} style={{ minWidth: 72 }}>
              Save
            </button>
            <button onClick={onClose} style={{ minWidth: 72 }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
