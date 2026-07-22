import type { ReactNode } from 'react'

/** System-tray strip of logos for the tech the tool is built with.
 *  Bare vectors on transparent - the per-era .tray / .tray-ico rules in
 *  index.css give them their era finish (flat on 95/98, glossy on XP/7). */

function Ico({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="tray-ico" title={name}>
      {children}
    </span>
  )
}

const ICONS: { name: string; node: ReactNode }[] = [
  {
    name: 'React',
    node: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="2.3" fill="#61dafb" />
        <g fill="none" stroke="#61dafb" strokeWidth="1.2">
          <ellipse cx="12" cy="12" rx="10" ry="4.3" />
          <ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(120 12 12)" />
        </g>
      </svg>
    ),
  },
  { name: 'TypeScript', node: <span className="tray-mark" style={{ color: '#3178c6' }}>TS</span> },
  {
    name: 'Vite',
    node: (
      <svg viewBox="0 0 24 24">
        <path d="M13 2 L5 12 L11 12 L9 22 L20 8 L13 8 Z" fill="#ffd028" />
      </svg>
    ),
  },
  { name: 'Tailwind CSS', node: <span className="tray-mark" style={{ color: '#38bdf8' }}>tw</span> },
  { name: 'Netlify', node: <span className="tray-mark" style={{ color: '#22c2b0' }}>N</span> },
  {
    name: 'Anthropic Claude',
    node: (
      <svg viewBox="0 0 24 24">
        <g stroke="#cc6b4a" strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
          <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
        </g>
      </svg>
    ),
  },
  { name: 'Ahrefs', node: <span className="tray-mark" style={{ color: '#2b6ef2' }}>a</span> },
  { name: 'SerpAPI', node: <span className="tray-mark" style={{ color: '#dd4b39' }}>S</span> },
]

export function TechTray() {
  return (
    <span className="tray-strip">
      {ICONS.map(i => (
        <Ico key={i.name} name={i.name}>
          {i.node}
        </Ico>
      ))}
    </span>
  )
}
