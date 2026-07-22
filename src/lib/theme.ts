/** Win95-style color schemes (Display Properties -> Appearance). */

export interface Scheme {
  name: string
  titlebar: string
  desktop: string
}

export const SCHEMES: Scheme[] = [
  { name: 'Windows standard', titlebar: '#000080', desktop: '#008080' },
  { name: 'Rainy day', titlebar: '#4f6d8c', desktop: '#71899e' },
  { name: 'Spruce', titlebar: '#0c5f4d', desktop: '#2f7d6b' },
  { name: 'Eggplant', titlebar: '#4b3b63', desktop: '#5e7d6b' },
  { name: 'Desert', titlebar: '#9a7636', desktop: '#b3a06b' },
  { name: 'Rose', titlebar: '#80395c', desktop: '#a8788e' },
  { name: 'Plum', titlebar: '#5e3b6b', desktop: '#7a6a86' },
  { name: 'Slate', titlebar: '#37424f', desktop: '#5a6675' },
  { name: 'Storm', titlebar: '#203040', desktop: '#3f5566' },
]

const TITLE_KEY = 'cn.pref.ui.titlebar'
const DESKTOP_KEY = 'cn.pref.ui.desktop'
const DEFAULTS = { titlebar: '#000080', desktop: '#008080' }

export function applyColors(titlebar: string, desktop: string) {
  if (typeof document === 'undefined') return
  const s = document.documentElement.style
  s.setProperty('--navy', titlebar)
  s.setProperty('--desktop', desktop)
}

export function getSavedColors(): { titlebar: string; desktop: string } {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  return {
    titlebar: localStorage.getItem(TITLE_KEY) || DEFAULTS.titlebar,
    desktop: localStorage.getItem(DESKTOP_KEY) || DEFAULTS.desktop,
  }
}

export function saveColors(titlebar: string, desktop: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TITLE_KEY, titlebar)
    localStorage.setItem(DESKTOP_KEY, desktop)
  }
  applyColors(titlebar, desktop)
}

export function applySavedColors() {
  const { titlebar, desktop } = getSavedColors()
  applyColors(titlebar, desktop)
}

/* ---- OS chrome (Windows 95 / 98 / XP / 7) ----
   The chrome + controls come from the MIT replica stylesheets 98.css / XP.css /
   7.css (they pixel-replicate the real OSes). Only ONE is applied at a time -
   their bare button/input/.window selectors collide if combined - so we hold a
   single <style id="os-theme"> element and swap its text on OS change. The
   stylesheets are imported as strings (?inline) and never auto-injected. Our own
   index.css (loaded after) keeps the layout-only pieces the libs don't ship:
   the taskbar, the desktop, the results list and the DR meter. */
import css98 from '98.css/dist/98.css?inline'
import cssXp from 'xp.css/dist/XP.css?inline'
import css7 from '7.css/dist/7.css?inline'

export type OsId = '95' | '98' | 'xp' | '7'

export const OSES: { id: OsId; name: string }[] = [
  { id: '95', name: 'Windows 95' },
  { id: '98', name: 'Windows 98' },
  { id: 'xp', name: 'Windows XP' },
  { id: '7', name: 'Windows 7' },
]

// Windows 95 = the 98.css base with flat (non-gradient) title bars. 98.css IS the
// 95/98 family; the only era difference that reads on this UI is the gradient.
const WIN95_TWEAKS = `
.title-bar{background:var(--navy)!important}
.title-bar.inactive{background:gray!important}
`

const OS_CSS: Record<OsId, string> = {
  '95': css98 + WIN95_TWEAKS,
  '98': css98,
  xp: cssXp,
  '7': css7,
}

const OS_KEY = 'cn.pref.ui.os'
const STYLE_ID = 'os-theme'

export function applyOs(os: OsId) {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    // First in <head> so index.css (injected after) wins specificity ties for
    // the layout pieces we override (title-bar tint, body, taskbar, meter).
    document.head.insertBefore(el, document.head.firstChild)
  }
  el.textContent = OS_CSS[os]
  document.documentElement.setAttribute('data-os', os)
}

export function getSavedOs(): OsId {
  if (typeof window === 'undefined') return '95'
  const v = localStorage.getItem(OS_KEY)
  return v === '98' || v === 'xp' || v === '7' || v === '95' ? v : '95'
}

export function saveOs(os: OsId) {
  if (typeof window !== 'undefined') localStorage.setItem(OS_KEY, os)
  applyOs(os)
}

export function applySavedOs() {
  applyOs(getSavedOs())
}
