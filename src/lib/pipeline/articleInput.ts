/**
 * Article text extraction for three input modes.
 * - Paste: raw textarea value
 * - Upload: .docx/.doc via mammoth (browser build)
 * - Google Doc: URL -> doc id -> /export?format=txt via corsproxy.io
 */

// mammoth is dynamically imported inside the function so the ~500 KB chunk
// only downloads when a user actually uploads a .docx.

export async function extractFromDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  const text = (result.value ?? '').trim()
  if (!text) throw new Error('Could not extract any text from that file.')
  return text
}

export function parseGoogleDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export async function fetchGoogleDoc(url: string): Promise<string> {
  const docId = parseGoogleDocId(url)
  if (!docId) throw new Error('Not a valid Google Docs URL.')
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`
  const proxied = `https://corsproxy.io/?${encodeURIComponent(exportUrl)}`
  const res = await fetch(proxied)
  if (!res.ok) {
    throw new Error(
      `Google Docs fetch failed (HTTP ${res.status}). Make sure the doc is shared as "Anyone with the link can view."`,
    )
  }
  const text = (await res.text()).trim()
  if (!text) throw new Error('Google Doc returned empty text.')
  return text
}
