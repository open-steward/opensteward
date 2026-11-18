/**
 * Helpers shared across NMI transform files.
 *
 * NMI represents money as decimal strings in major units ("12.50"); the
 * canonical schema wants integer minor units. The Query API ships XML and the
 * Payment API ships a URL-encoded query string, so we provide a tiny,
 * dependency-free XML extractor scoped to NMI's flat report shapes.
 */

/** Major-unit decimal string ("12.50") → integer minor units (1250). */
export function decimalToMinor(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** NMI is single-currency per merchant account; default USD when not echoed. */
export function pickCurrency(v: string | null | undefined): string {
  if (typeof v !== 'string') return 'USD'
  const c = v.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : 'USD'
}

/**
 * Convert NMI's compact datetime format `YYYYMMDDHHmmss` (14 digits, UTC) to
 * an ISO-8601 string. Falls back to undefined for any unparseable input.
 * This is needed because `toIsoDatetime` treats all-digit strings as epoch
 * seconds/milliseconds, which produces wrong results for NMI timestamps.
 */
export function parseNmiDatetime(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  // Match the NMI compact format: YYYYMMDDHHmmss (exactly 14 digits)
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s)
  if (m) {
    const [, yr, mo, dy, hh, mm, ss] = m
    const d = new Date(`${yr}-${mo}-${dy}T${hh}:${mm}:${ss}Z`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  // Fall back: try the standard parser for other formats (e.g. ISO strings)
  if (/^\d+$/.test(s)) return undefined // pure epoch strings are ambiguous for NMI — drop them
  const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  return undefined
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}

// ── Minimal XML extraction for the Query API (query.php) ────────────────────
//
// NMI Query API responses are shallow: <nm_response> with repeated
// <transaction> (or <customer>) blocks, each holding flat leaf tags plus
// repeated <action> children. A full XML library is overkill, so we extract
// by tag the same way the accounting/tallyprime adapter does.

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Return the inner text of the FIRST `<tag>…</tag>` in `xml`, or undefined. */
export function xmlTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return undefined
  const v = decodeEntities(m[1] ?? '').trim()
  return v === '' ? undefined : v
}

/** Return every `<tag>…</tag>` block (with its wrapper) found in `xml`. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
  return xml.match(re) ?? []
}
