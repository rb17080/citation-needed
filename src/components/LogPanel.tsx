import { useEffect, useRef } from 'react'
import type { LogEntry } from '../lib/pipeline/types'

/** Run output, styled as a Win95 console pane inside a group box. */
export function LogPanel({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log])

  if (!log.length) return null
  return (
    <fieldset style={{ marginTop: 12 }}>
      <legend>Output</legend>
      <div
        ref={ref}
        className="sunken scroll"
        style={{
          height: 116,
          overflow: 'auto',
          padding: '4px 6px',
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      >
        {log.map((e, i) => (
          <div
            key={i}
            style={{
              color: e.kind === 'error' ? '#800000' : e.kind === 'done' ? '#008000' : '#0a0a0a',
            }}
          >
            {e.text}
          </div>
        ))}
      </div>
    </fieldset>
  )
}
