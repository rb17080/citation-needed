import { useEffect, useState } from 'react'
import { LinkSourcer } from './pages/LinkSourcer'
import { HistoryPanel } from './components/HistoryPanel'
import { SerpView } from './components/SerpView'
import { SettingsModal } from './components/SettingsModal'
import { TechTray } from './components/TechTray'
import { useApiKey } from './lib/settings'

type View = 'sourcer' | 'history' | 'serp'

function fmtTime(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The Citation Needed app logo - the [*] mark on an indigo badge.
 *  DOM text (crisper than SVG <text> at 16px); the badge frame is restyled
 *  per era in index.css. Shared by the title bar and the taskbar button. */
function Logo() {
  return (
    <span className="win-icon app-badge" aria-hidden>
      <span className="app-badge-mark">[*]</span>
    </span>
  )
}

export function App() {
  const [view, setView] = useState<View>('sourcer')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clock, setClock] = useState(() => fmtTime())
  const anthropic = useApiKey('anthropic')

  useEffect(() => {
    const id = setInterval(() => setClock(fmtTime()), 15000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ minHeight: '100%', padding: '18px 16px 56px' }}>
      <div className="desktop-icon" role="button" tabIndex={0} title="Citation Needed">
        <span className="desktop-icon-badge" aria-hidden>
          [*]
        </span>
        <span className="desktop-icon-label">Citation Needed</span>
      </div>

      <div className="window" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="title-bar">
          <div className="title-bar-text" style={{ display: 'flex', alignItems: 'center' }}>
            <Logo />
            citation_needed.exe
          </div>
          <div className="title-bar-controls">
            <button aria-label="Minimize" />
            <button aria-label="Maximize" />
            <button aria-label="Close" />
          </div>
        </div>

        <div className="window-body">
          <div className="tab-bar">
            <button className={view === 'sourcer' ? 'is-active' : ''} onClick={() => setView('sourcer')}>
              Find Links
            </button>
            <button className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
              History
            </button>
            <button className={view === 'serp' ? 'is-active' : ''} onClick={() => setView('serp')}>
              SERP
            </button>
            <button style={{ marginLeft: 'auto' }} onClick={() => setSettingsOpen(true)}>
              Settings...
            </button>
          </div>

          {view === 'sourcer' ? (
            <LinkSourcer onOpenSettings={() => setSettingsOpen(true)} />
          ) : view === 'history' ? (
            <HistoryPanel />
          ) : (
            <SerpView onOpenSettings={() => setSettingsOpen(true)} />
          )}

          <div className="status-bar" style={{ marginTop: 10 }}>
            <span className="status-bar-field" style={{ flex: 1 }}>
              {anthropic.present ? 'Ready' : 'No key set - try a sample run (no keys needed)'}
            </span>
            <span className="status-bar-field">citation_needed</span>
          </div>
        </div>
      </div>

      <div className="taskbar">
        <div className="start" role="button" tabIndex={0}>
          <span className="start-flag">
            <span style={{ background: '#ff0000' }} />
            <span style={{ background: '#00a800' }} />
            <span style={{ background: '#0000ff' }} />
            <span style={{ background: '#ffff00' }} />
          </span>
          {/* Windows 7 glass-pearl Start orb (shown only on data-os=7) */}
          <svg className="start-orb" width="40" height="40" viewBox="0 0 40 40" aria-hidden xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="w7glow" cx="50%" cy="50%" r="50%">
                <stop offset="62%" stopColor="#1f8fe6" stopOpacity="0" />
                <stop offset="86%" stopColor="#1f8fe6" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#1f8fe6" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="w7rim" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#dff3ff" />
                <stop offset="40%" stopColor="#1466b8" />
                <stop offset="100%" stopColor="#021a30" />
              </linearGradient>
              <radialGradient id="w7body" cx="50%" cy="37%" r="68%">
                <stop offset="0%" stopColor="#a6dbf6" />
                <stop offset="15%" stopColor="#56ace7" />
                <stop offset="34%" stopColor="#2182cf" />
                <stop offset="54%" stopColor="#115fa6" />
                <stop offset="74%" stopColor="#0a4279" />
                <stop offset="90%" stopColor="#062c4f" />
                <stop offset="100%" stopColor="#03182b" />
              </radialGradient>
              <radialGradient id="w7gloss" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="55%" stopColor="#ffffff" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="w7red" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ff8a72" />
                <stop offset="46%" stopColor="#f0492f" />
                <stop offset="100%" stopColor="#cb2212" />
              </linearGradient>
              <linearGradient id="w7green" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#b6e87b" />
                <stop offset="46%" stopColor="#6fc23a" />
                <stop offset="100%" stopColor="#3f9420" />
              </linearGradient>
              <linearGradient id="w7blue" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#7fccf7" />
                <stop offset="46%" stopColor="#2f9ae6" />
                <stop offset="100%" stopColor="#1268bf" />
              </linearGradient>
              <linearGradient id="w7yellow" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ffe891" />
                <stop offset="46%" stopColor="#ffc93a" />
                <stop offset="100%" stopColor="#f0a210" />
              </linearGradient>
              <linearGradient id="w7flagGloss" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                <stop offset="42%" stopColor="#ffffff" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="20" fill="url(#w7glow)" />
            <circle cx="20" cy="20" r="17.4" fill="url(#w7rim)" />
            <circle cx="20" cy="20" r="16" fill="url(#w7body)" />
            <g>
              <path d="M11.7 13.1 C14.2 12.6 16.7 12.6 19.1 13.0 L19.1 19.0 C16.7 18.6 14.2 18.6 11.7 19.1 Z" fill="url(#w7red)" />
              <path d="M20.9 13.0 C23.3 12.6 25.8 12.6 28.3 13.1 L28.3 19.1 C25.8 18.6 23.3 18.6 20.9 19.0 Z" fill="url(#w7green)" />
              <path d="M11.7 20.9 C14.2 20.4 16.7 20.4 19.1 20.8 L19.1 26.8 C16.7 26.4 14.2 26.4 11.7 26.9 Z" fill="url(#w7blue)" />
              <path d="M20.9 20.8 C23.3 20.4 25.8 20.4 28.3 20.9 L28.3 26.9 C25.8 26.4 23.3 26.4 20.9 26.8 Z" fill="url(#w7yellow)" />
              <path d="M11.7 13.1 C14.2 12.6 16.7 12.6 19.1 13.0 L19.1 19.0 C16.7 18.6 14.2 18.6 11.7 19.1 Z" fill="url(#w7flagGloss)" />
              <path d="M20.9 13.0 C23.3 12.6 25.8 12.6 28.3 13.1 L28.3 19.1 C25.8 18.6 23.3 18.6 20.9 19.0 Z" fill="url(#w7flagGloss)" />
            </g>
            <ellipse cx="20" cy="10" rx="12.4" ry="6.2" fill="url(#w7gloss)" />
            <path d="M9 12 A16 16 0 0 1 31 12" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.7" />
          </svg>
          <span className="start-label">Start</span>
        </div>
        <div className="taskwin is-active" role="button" tabIndex={0}>
          <Logo />
          citation_needed
        </div>
        <span className="tray">
          <span>made with</span>
          <TechTray />
          <span className="clock">{clock}</span>
        </span>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
