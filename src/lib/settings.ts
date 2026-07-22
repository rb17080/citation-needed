/**
 * Local-first settings: bring-your-own-key (localStorage) + simple prefs.
 * No backend, no accounts. Keys never persist server-side - they ride along
 * as request headers that the serverless proxies forward upstream.
 */
import { useCallback, useEffect, useState } from 'react'

const PREF_PREFIX = 'cn.pref.'
const KEY_PREFIX = 'cn.key.'
const KEYS_CHANGED = 'cn:keys-changed'

export type ApiKeyId = 'anthropic' | 'serp' | 'ahrefs'

export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 - recommended (best quality)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 - faster / cheaper' },
] as const

/* ---- prefs ---- */
function readPref(key: string): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(key) ?? ''
}
function writePref(key: string, value: string) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(key, value)
  else window.localStorage.removeItem(key)
}
export function getPref(name: string): string {
  return readPref(PREF_PREFIX + name)
}
export function setPref(name: string, value: string) {
  writePref(PREF_PREFIX + name, value)
}

/* ---- BYO keys (localStorage) ---- */
export function getKey(id: ApiKeyId): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(KEY_PREFIX + id) ?? ''
}
export function setKey(id: ApiKeyId, value: string) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(KEY_PREFIX + id, value)
  else window.localStorage.removeItem(KEY_PREFIX + id)
  window.dispatchEvent(new CustomEvent(KEYS_CHANGED))
}

export function useApiKey(id: ApiKeyId) {
  const [present, setPresent] = useState(() => !!getKey(id))
  useEffect(() => {
    const sync = () => setPresent(!!getKey(id))
    window.addEventListener('storage', sync)
    window.addEventListener(KEYS_CHANGED, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(KEYS_CHANGED, sync)
    }
  }, [id])
  const save = useCallback((value: string) => setKey(id, value), [id])
  return { present, loading: false, save, error: null as string | null }
}

/**
 * fetch() wrapper that attaches whatever keys the user has saved as headers.
 * The serverless proxy reads them and forwards to the upstream API; the keys
 * are never stored on a server, only held in this browser.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const anthropic = getKey('anthropic')
  const serp = getKey('serp')
  const ahrefs = getKey('ahrefs')
  if (anthropic) headers.set('x-anthropic-key', anthropic)
  if (serp) headers.set('x-serp-key', serp)
  if (ahrefs) headers.set('x-ahrefs-key', ahrefs)
  return fetch(input, { ...init, headers })
}
