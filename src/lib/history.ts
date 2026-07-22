/**
 * localStorage-backed run history. Newest-first, capped at 30 entries (oldest
 * dropped on overflow). All access is guarded for SSR (no window) and wrapped
 * in try/catch so a quota/parse error never crashes the app.
 */

import type { SavedRun } from './types'

const STORAGE_KEY = 'cn.history'
const CAP = 30

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function readAll(): SavedRun[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedRun[]) : []
  } catch {
    return []
  }
}

function writeAll(runs: SavedRun[]): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
  } catch {
    /* quota or serialization error - ignore, history is best-effort */
  }
}

/** All saved runs, newest first. */
export function listRuns(): SavedRun[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Persist a new run. Assigns id (crypto.randomUUID) and createdAt (Date.now),
 * prepends it as newest, trims to the 30-entry cap, and returns the saved run.
 */
export function saveRun(run: Omit<SavedRun, 'id' | 'createdAt'>): SavedRun {
  const saved: SavedRun = {
    ...run,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  const next = [saved, ...readAll()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, CAP)
  writeAll(next)
  return saved
}

/** Remove one run by id. */
export function deleteRun(id: string): void {
  const next = readAll().filter(r => r.id !== id)
  writeAll(next)
}

/** Remove all saved runs. */
export function clearRuns(): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
