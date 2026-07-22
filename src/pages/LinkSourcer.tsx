import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { runPipeline } from '../lib/pipeline/pipeline'
import { regenerateLink } from '../lib/pipeline/regen'
import type { AhrefsMetrics, Candidate, LinkKind, LinkRow } from '../lib/types'
import type { LogEntry, LogKind } from '../lib/pipeline/types'
import { extractFromDocx, fetchGoogleDoc } from '../lib/pipeline/articleInput'
import { fetchSitemapCandidates } from '../lib/sitemap'
import { enrichExternal } from '../lib/ahrefs'
import { checkLinks } from '../lib/linkHealth'
import { getDemoRun, replayDemoRun } from '../lib/demo'
import { saveRun } from '../lib/history'
import { DEFAULT_MODEL, MODELS, getPref, setPref, useApiKey } from '../lib/settings'
import { hostOf } from '../lib/format'
import { registrableDomainOf } from '../lib/pipeline/serp'
import { ResultsTable } from '../components/ResultsTable'
import { LogPanel } from '../components/LogPanel'
import { RunProgress } from '../components/RunProgress'
import { CostMeter, addUsage, emptyCost, type CostState } from '../components/CostMeter'

type Tab = 'paste' | 'upload' | 'gdoc'

export function LinkSourcer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const anthropic = useApiKey('anthropic')
  const serp = useApiKey('serp')
  const ahrefs = useApiKey('ahrefs')

  const [model, setModel] = useState<string>(() => getPref('model') || DEFAULT_MODEL)
  const [domain, setDomain] = useState('')
  const [tab, setTab] = useState<Tab>('paste')
  const [pasted, setPasted] = useState('')
  const [uploadedText, setUploadedText] = useState('')
  const [uploadedName, setUploadedName] = useState('No file selected')
  const [gdocUrl, setGdocUrl] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [drFloor, setDrFloor] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [runComplete, setRunComplete] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  // URL of the row a replacement just landed in - drives the replace-flash
  // animation, then clears so the same row can flash again on a later swap.
  const [flashUrl, setFlashUrl] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [internal, setInternal] = useState<LinkRow[]>([])
  const [external, setExternal] = useState<LinkRow[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [pools, setPools] = useState<{ internal: Candidate[]; external: Candidate[] } | null>(null)
  const [cost, setCost] = useState<CostState>(emptyCost())

  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const regenAbortRef = useRef<AbortController | null>(null)
  // Frozen replacement pool for demo-mode reject/replace (no API calls).
  const demoSparesRef = useRef<{ internal: LinkRow[]; external: LinkRow[] } | null>(null)

  const articleText = useMemo(() => {
    if (tab === 'paste') return pasted.trim()
    if (tab === 'upload') return uploadedText.trim()
    return ''
  }, [tab, pasted, uploadedText])

  const canRun = anthropic.present && !!domain.trim() && (tab === 'gdoc' ? !!gdocUrl.trim() : !!articleText)
  // Demo replaces come from the frozen spare pool, so regen works there too.
  const canRegen = !running && !scoring && topics.length > 0 && (internal.length > 0 || external.length > 0)
  const hasResults = internal.length > 0 || external.length > 0
  const busy = running || scoring

  // Honest run progress: real milestones only (no fake animation) - topics,
  // candidate pools, each streamed link, then the scoring pass.
  const progress = (() => {
    if (runComplete) return 100
    if (!busy) return 0
    let p = 5
    if (topics.length) p += 15
    if (pools) p += 10
    p += Math.min(60, (internal.length + external.length) * 3)
    if (scoring) p += 5
    return Math.min(97, p)
  })()
  const progressPhase = runComplete
    ? 'Done'
    : !topics.length
      ? 'Extracting topics...'
      : scoring
        ? 'Scoring + health checks...'
        : !hasResults
          ? 'Gathering candidates...'
          : 'Ranking links...'

  function handleModelChange(next: string) {
    setModel(next)
    setPref('model', next)
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploadedName(`Reading ${file.name}...`)
    setUploadedText('')
    try {
      const text = await extractFromDocx(file)
      setUploadedText(text)
      setUploadedName(`${file.name} - ${text.length.toLocaleString()} chars`)
    } catch (err) {
      setUploadedName('No file selected')
      setError(err instanceof Error ? err.message : 'Failed to read file')
    }
  }

  const appendLog = useCallback((text: string, kind: LogKind = 'info') => {
    setLog(prev => [...prev, { text, kind }])
  }, [])

  const flashRow = useCallback((url: string) => {
    setFlashUrl(url)
    window.setTimeout(() => setFlashUrl(cur => (cur === url ? null : cur)), 700)
  }, [])

  function resetResults() {
    setError(null)
    setLog([])
    setInternal([])
    setExternal([])
    setTopics([])
    setPools(null)
    setCost(emptyCost())
    setIsDemo(false)
    setRunComplete(false)
    demoSparesRef.current = null
  }

  async function handleRun() {
    if (busy && abortRef.current) {
      abortRef.current.abort()
      return
    }
    resetResults()
    setRunning(true)
    const ac = new AbortController()
    abortRef.current = ac

    const collectedInternal: LinkRow[] = []
    const collectedExternal: LinkRow[] = []
    let runTopics: string[] = []
    // Local copy of the pools - the `pools` state set via onPools isn't
    // readable from this closure, and auto-replace needs it right away.
    let runPools: { internal: Candidate[]; external: Candidate[] } | null = null

    try {
      let article = articleText
      if (tab === 'gdoc') {
        appendLog('Fetching Google Doc...', 'info')
        article = await fetchGoogleDoc(gdocUrl.trim())
        appendLog(`Fetched ${article.length} chars from Google Doc`, 'info')
      }
      if (!article) throw new Error('Article content is empty')

      await runPipeline({
        hasSerpKey: serp.present,
        model,
        domain: domain.trim(),
        article,
        customPrompt,
        abortSignal: ac.signal,
        getInternalCandidates: (d, t, s) => fetchSitemapCandidates(d, t, s),
        callbacks: {
          onLog: appendLog,
          onUrl: (url, kind, meta) => {
            const row: LinkRow = {
              url,
              kind,
              sourceTopic: meta?.sourceTopic ?? null,
              title: meta?.title ?? null,
            }
            if (kind === 'internal') {
              collectedInternal.push(row)
              setInternal(prev => [...prev, row])
            } else {
              collectedExternal.push(row)
              setExternal(prev => [...prev, row])
            }
          },
          onTopics: t => {
            runTopics = t
            setTopics(t)
          },
          onPools: (i, e) => {
            runPools = { internal: i, external: e }
            setPools(runPools)
          },
          onUsage: u => setCost(c => addUsage(c, u)),
        },
      })

      setRunning(false)
      setScoring(true)
      await enrichAndCheck(collectedInternal, collectedExternal, ac.signal, {
        topics: runTopics,
        pools: runPools,
      })

      if (ac.signal.aborted) {
        appendLog('Run stopped', 'error')
        return
      }
      setRunComplete(true)

      if (collectedInternal.length || collectedExternal.length) {
        saveRun({
          domain: domain.trim(),
          topics: runTopics,
          internal: collectedInternal,
          external: collectedExternal,
        })
      }
    } catch (err) {
      const e = err as { name?: string; message?: string }
      if (e?.name === 'AbortError') appendLog('Run stopped', 'error')
      else {
        const msg = e?.message || String(err)
        appendLog('Error: ' + msg, 'error')
        setError(msg)
      }
    } finally {
      abortRef.current = null
      setRunning(false)
      setScoring(false)
    }
  }

  async function enrichAndCheck(
    intRows: LinkRow[],
    extRows: LinkRow[],
    signal: AbortSignal,
    regenCtx?: { topics: string[]; pools: { internal: Candidate[]; external: Candidate[] } | null },
  ) {
    const tasks: Promise<void>[] = []

    if (ahrefs.present && extRows.length) {
      appendLog('Scoring external links with Ahrefs (DR + traffic)...', 'info')
      tasks.push(
        enrichExternal(
          extRows.map(r => r.url),
          { signal },
        )
          .then(byHost => {
            if (signal.aborted) return
            const apply = (r: LinkRow): LinkRow => ({ ...r, metrics: byHost.get(hostOf(r.url)) ?? r.metrics ?? null })
            extRows.forEach((r, i) => (extRows[i] = apply(r)))
            setExternal(prev => prev.map(apply))
            appendLog(`  -> scored ${byHost.size} domains`, 'result')
          })
          .catch(e => {
            if (signal.aborted) return
            appendLog('Ahrefs scoring failed: ' + (e instanceof Error ? e.message : String(e)), 'error')
          }),
      )
    } else if (extRows.length && !ahrefs.present) {
      appendLog('No Ahrefs key - skipping authority scores (add one in Settings).', 'info')
    }

    const allUrls = [...intRows, ...extRows].map(r => r.url)
    if (allUrls.length) {
      appendLog('Checking link health...', 'info')
      tasks.push(
        checkLinks(allUrls, signal)
          .then(byUrl => {
            if (signal.aborted) return
            const apply = (r: LinkRow): LinkRow => {
              const h = byUrl.get(r.url)
              if (!h) return r
              return { ...r, health: h, date: r.date ?? h.date, title: r.title ?? h.title }
            }
            intRows.forEach((r, i) => (intRows[i] = apply(r)))
            extRows.forEach((r, i) => (extRows[i] = apply(r)))
            setInternal(prev => prev.map(apply))
            setExternal(prev => prev.map(apply))
            appendLog(`  -> checked ${byUrl.size} links`, 'result')
          })
          .catch(e => {
            if (signal.aborted) return
            appendLog('Health check failed: ' + (e instanceof Error ? e.message : String(e)), 'error')
          }),
      )
    }

    await Promise.all(tasks)

    // Dead links never make the list: any row that health-checked as dead or
    // hard-error gets auto-swapped from the already-gathered pool. One pass,
    // pool mode only (no pool -> the red badge stays and the user can hit x).
    if (regenCtx?.pools && regenCtx.topics.length && !signal.aborted) {
      await autoReplaceUnhealthy(intRows, extRows, signal, {
        topics: regenCtx.topics,
        pools: regenCtx.pools,
      })
    }
    appendLog('Done', 'done')
  }

  async function autoReplaceUnhealthy(
    intRows: LinkRow[],
    extRows: LinkRow[],
    signal: AbortSignal,
    ctx: { topics: string[]; pools: { internal: Candidate[]; external: Candidate[] } },
  ) {
    const isBad = (r: LinkRow) => r.health?.band === 'dead' || r.health?.band === 'error'
    const norm = (u: string) => u.split('#')[0].replace(/\/+$/, '').toLowerCase()

    for (const kind of ['internal', 'external'] as const) {
      if (signal.aborted) return
      const rows = kind === 'internal' ? intRows : extRows
      const setter = kind === 'internal' ? setInternal : setExternal
      const bad = rows.filter(isBad)
      if (!bad.length) continue

      appendLog(`${bad.length} ${kind} link(s) dead or erroring - auto-replacing from pool`, 'info')
      let replacements: string[]
      try {
        replacements = await regenerateLink(
          kind,
          bad.map(r => r.url),
          {
            hasSerpKey: serp.present,
            model,
            domain: domain.trim(),
            customPrompt,
            topics: ctx.topics,
            pools: ctx.pools,
            allUsedUrls: [...intRows, ...extRows].map(r => r.url),
            abortSignal: signal,
          },
          appendLog,
        )
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
        appendLog('Auto-replace failed: ' + (e instanceof Error ? e.message : String(e)), 'error')
        continue
      }

      // Filter out anything that would duplicate a kept row, then splice the
      // survivors into the dead rows' positions.
      const used = new Set(rows.filter(r => !isBad(r)).map(r => norm(r.url)))
      const usedSites = new Set(
        kind === 'external' ? extRows.filter(r => !isBad(r)).map(r => registrableDomainOf(r.url)) : [],
      )
      const pool = kind === 'internal' ? ctx.pools.internal : ctx.pools.external
      const poolByUrl = new Map(pool.map(c => [norm(c.url), c]))
      const fresh: LinkRow[] = []
      for (const url of replacements) {
        if (used.has(norm(url))) continue
        if (kind === 'external') {
          const site = registrableDomainOf(url)
          if (usedSites.has(site)) continue
          usedSites.add(site)
        }
        used.add(norm(url))
        const cand = poolByUrl.get(norm(url))
        fresh.push({
          url,
          kind,
          sourceTopic: cand?.sourceTopic ?? null,
          title: cand?.title || null,
        })
      }

      let placed = 0
      for (const deadRow of bad) {
        const next = fresh[placed]
        if (!next) break
        const idx = rows.findIndex(r => r.url === deadRow.url)
        if (idx === -1) continue
        rows[idx] = next
        placed++
      }
      if (!placed) {
        appendLog('  → no usable replacements in the pool - leaving the flagged link(s)', 'result')
        continue
      }
      appendLog(`  → replaced ${placed} ${kind} link(s)`, 'result')
      setter([...rows])

      // Score + health-check just the replacements (single pass - a dead
      // replacement keeps its badge rather than looping).
      const freshUrls = fresh.slice(0, placed).map(r => r.url)
      try {
        const [byHost, byUrl] = await Promise.all([
          kind === 'external' && ahrefs.present
            ? enrichExternal(freshUrls, { signal })
            : Promise.resolve(new Map<string, AhrefsMetrics>()),
          checkLinks(freshUrls, signal),
        ])
        if (signal.aborted) return
        const apply = (r: LinkRow): LinkRow => {
          if (!freshUrls.includes(r.url)) return r
          const h = byUrl.get(r.url)
          const metrics = kind === 'external' ? (byHost.get(hostOf(r.url)) ?? r.metrics ?? null) : r.metrics
          return { ...r, metrics, health: h ?? r.health, date: r.date ?? h?.date, title: r.title ?? h?.title }
        }
        rows.forEach((r, i) => (rows[i] = apply(r)))
        setter(prev => prev.map(apply))
      } catch {
        /* best-effort - replacements stay unscored rather than failing the run */
      }
    }
  }

  async function handleDemo() {
    if (busy && abortRef.current) {
      abortRef.current.abort()
      return
    }
    resetResults()
    const demo = getDemoRun()
    setIsDemo(true)
    demoSparesRef.current = {
      internal: [...demo.spares.internal],
      external: [...demo.spares.external],
    }
    setDomain(demo.domain)
    setPasted(demo.articleText)
    setTab('paste')
    setRunning(true)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await replayDemoRun(
        demo,
        {
          onLog: (t, k) => {
            if (!ac.signal.aborted) appendLog(t, k)
          },
          onTopics: t => {
            if (!ac.signal.aborted) setTopics(t)
          },
          onRow: row => {
            if (ac.signal.aborted) return
            if (row.kind === 'internal') setInternal(prev => [...prev, row])
            else setExternal(prev => [...prev, row])
          },
        },
        ac.signal,
      )
      if (!ac.signal.aborted) setRunComplete(true)
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        appendLog('Error: ' + (e instanceof Error ? e.message : String(e)), 'error')
      }
    } finally {
      abortRef.current = null
      setRunning(false)
    }
  }

  const handleRegen = useCallback(
    async (kind: LinkKind, originalIndex: number): Promise<void> => {
      const arr = kind === 'internal' ? internal : external
      const rejected = arr[originalIndex]
      if (!rejected) throw new Error('Row not found')

      // Demo mode: swap from the frozen spare pool - same UX, zero API calls.
      if (isDemo) {
        const spares = demoSparesRef.current
        const list = spares ? (kind === 'internal' ? spares.internal : spares.external) : []
        const usedUrls = new Set([...internal, ...external].map(r => r.url))
        const usedSites = new Set(
          external.filter((_, i) => !(kind === 'external' && i === originalIndex)).map(r => registrableDomainOf(r.url)),
        )
        const spareIdx = list.findIndex(
          s =>
            !usedUrls.has(s.url) &&
            (kind === 'internal' || !usedSites.has(registrableDomainOf(s.url))),
        )
        if (spareIdx === -1) {
          throw new Error('No more replacements available - add keys and run live for unlimited swaps')
        }
        const [spare] = list.splice(spareIdx, 1)
        const setter = kind === 'internal' ? setInternal : setExternal
        setter(prev => prev.map((r, i) => (i === originalIndex ? spare : r)))
        flashRow(spare.url)
        appendLog(`Replaced - swapped in ${spare.url} (no API calls)`, 'result')
        return
      }

      const ac = new AbortController()
      regenAbortRef.current = ac
      const replacements = await regenerateLink(
        kind,
        [rejected.url],
        {
          hasSerpKey: serp.present,
          model,
          domain: domain.trim(),
          customPrompt,
          topics,
          pools,
          allUsedUrls: [...internal, ...external].map(r => r.url),
          abortSignal: ac.signal,
        },
        appendLog,
      )
      const newUrl = replacements[0]
      if (!newUrl) throw new Error('Empty replacement')
      if ([...internal, ...external].some(r => r.url === newUrl)) {
        throw new Error('Replacement duplicated an existing link - try again')
      }
      if (
        kind === 'external' &&
        external.some(
          (r, i) => i !== originalIndex && registrableDomainOf(r.url) === registrableDomainOf(newUrl),
        )
      ) {
        throw new Error('Replacement is from a site already in the list - try again')
      }
      let newRow: LinkRow = { url: newUrl, kind, sourceTopic: rejected.sourceTopic }
      const setter = kind === 'internal' ? setInternal : setExternal
      setter(prev => prev.map((r, i) => (i === originalIndex ? newRow : r)))
      flashRow(newUrl)

      try {
        if (kind === 'external' && ahrefs.present) {
          const byHost = await enrichExternal([newUrl], { signal: ac.signal })
          newRow = { ...newRow, metrics: byHost.get(hostOf(newUrl)) ?? null }
        }
        const byUrl = await checkLinks([newUrl], ac.signal)
        const h = byUrl.get(newUrl)
        if (h) newRow = { ...newRow, health: h, date: h.date, title: h.title }
        if (!ac.signal.aborted) setter(prev => prev.map((r, i) => (i === originalIndex ? newRow : r)))
      } catch {
        /* best-effort */
      }
    },
    [internal, external, isDemo, serp.present, ahrefs.present, model, domain, customPrompt, topics, pools, appendLog, flashRow],
  )

  useEffect(
    () => () => {
      abortRef.current?.abort()
      regenAbortRef.current?.abort()
    },
    [],
  )

  return (
    <div style={{ padding: '12px 14px' }}>
      <fieldset>
        <legend>Source</legend>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Target domain:
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
              spellCheck={false}
              style={{ width: 180 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Model:
            <select value={model} onChange={e => handleModelChange(e.target.value)}>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 6 }}>
            {(['paste', 'upload', 'gdoc'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={tab === t ? 'is-active' : undefined}
                style={{ minWidth: 0, padding: '4px 12px' }}
              >
                {t === 'paste' ? 'Paste' : t === 'upload' ? 'Upload .docx' : 'Google Doc'}
              </button>
            ))}
          </div>
          {tab === 'paste' && (
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder="Paste the full article text here..."
              spellCheck={false}
              className="scroll"
              style={{ width: '100%', height: 110, resize: 'vertical' }}
            />
          )}
          {tab === 'upload' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => fileRef.current?.click()} style={{ minWidth: 0 }}>
                Choose file...
              </button>
              <input ref={fileRef} type="file" accept=".doc,.docx" onChange={handleFile} hidden />
              <span style={{ color: '#404040' }}>{uploadedName}</span>
            </div>
          )}
          {tab === 'gdoc' && (
            <input
              type="text"
              value={gdocUrl}
              onChange={e => setGdocUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              spellCheck={false}
              style={{ width: '100%' }}
            />
          )}
        </div>

        {(tab === 'gdoc' ? !gdocUrl.trim() : !articleText) && !busy && !hasResults && (
          <div
            style={{
              marginBottom: 12,
              display: 'inline-block',
              background: '#ffffe1',
              border: '1px solid #000',
              padding: '4px 8px',
              fontSize: 11,
            }}
          >
            Start here - add your article above, then click Find Links (or watch a sample run, no keys needed).
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            Extra:
            <input
              type="text"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="optional - narrow the focus, exclude sources"
              style={{ flex: 1 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Hide external DR below:
            <select value={drFloor} onChange={e => setDrFloor(Number(e.target.value))}>
              {[0, 20, 30, 40, 50, 60, 70, 80].map(n => (
                <option key={n} value={n}>
                  {n === 0 ? 'off' : n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleRun}
            disabled={!canRun && !busy}
            style={{ fontWeight: 'bold', ...(canRun && !busy ? { outline: '1px dotted #000', outlineOffset: '-4px' } : null) }}
          >
            {busy && !isDemo ? 'Stop' : 'Find Links'}
          </button>
          <button onClick={handleDemo} disabled={busy && !isDemo}>
            {isDemo && busy ? 'Stop' : 'Watch a demo run'}
          </button>
          <span style={{ marginLeft: 'auto', color: '#404040' }}>
            <CostMeter cost={cost} />
          </span>
        </div>

        {!anthropic.present && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#202020' }}>
            No keys needed to watch a sample run. For live runs,{' '}
            <button
              onClick={onOpenSettings}
              style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }}
            >
              add an Anthropic key
            </button>{' '}
            (SerpAPI and Ahrefs optional).
          </div>
        )}
        {error && (
          <div className="sunken-thin" style={{ marginTop: 10, padding: '6px 8px', color: '#800000' }}>
            {error}
          </div>
        )}
      </fieldset>

      {(busy || runComplete) && <RunProgress percent={progress} phase={progressPhase} />}

      {isDemo && hasResults && (
        <div className="sunken-thin" style={{ marginTop: 12, padding: '6px 8px', color: '#202020' }}>
          Sample run - real links and real Ahrefs scores, frozen so it works with no keys.
        </div>
      )}

      <LogPanel log={log} />

      {!hasResults && !busy && log.length === 0 && (
        <div className="sunken" style={{ marginTop: 12, padding: 20, textAlign: 'center', color: '#606060' }}>
          No results yet. Add an article and a target domain above, then click <b>Find Links</b> - or try a{' '}
          <b>sample run</b> (no keys needed).
        </div>
      )}

      {hasResults && (
        <>
          <ResultsTable
            title="External links"
            kind="external"
            rows={external}
            scoring={scoring}
            drFloor={drFloor}
            canRegen={canRegen}
            onRegen={idx => handleRegen('external', idx)}
            flashUrl={flashUrl}
          />
          <ResultsTable
            title="Internal links"
            kind="internal"
            rows={internal}
            scoring={scoring}
            canRegen={canRegen}
            onRegen={idx => handleRegen('internal', idx)}
            flashUrl={flashUrl}
          />
        </>
      )}
    </div>
  )
}
