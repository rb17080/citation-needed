/**
 * Stateful, line-buffered URL extractor for the model's streamed text.
 *
 * Switches mode when it sees "internal links:" or "external links:" (case
 * insensitive) in any line, then fires the appropriate callback for each URL
 * on subsequent lines. Dedupes across the full stream via a Set.
 *
 * Callers MUST invoke .finish() after the stream ends to flush any trailing
 * partial line (URLs often arrive on the same line as the closing bracket
 * without a terminating newline).
 */
export class UrlStreamParser {
  private buffer = ''
  private mode: 'internal' | 'external' | null = null
  private seen = new Set<string>()

  constructor(
    private onInternal: (url: string) => void,
    private onExternal: (url: string) => void,
  ) {}

  feed(textChunk: string) {
    this.buffer += textChunk
    let nl: number
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      this.processLine(line)
    }
  }

  finish() {
    if (this.buffer.length > 0) this.processLine(this.buffer)
    this.buffer = ''
  }

  private processLine(line: string) {
    const lower = line.toLowerCase()
    if (lower.includes('internal links:')) {
      this.mode = 'internal'
      return
    }
    if (lower.includes('external links:')) {
      this.mode = 'external'
      return
    }
    const match = line.match(/https?:\/\/[^\s<>"'\])]+/)
    if (!match || !this.mode) return
    const url = match[0].replace(/[.,)\];]+$/, '')
    if (this.seen.has(url)) return
    this.seen.add(url)
    if (this.mode === 'internal') this.onInternal(url)
    else this.onExternal(url)
  }
}
