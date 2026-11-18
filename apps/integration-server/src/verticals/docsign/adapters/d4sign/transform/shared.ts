export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * D4Sign returns timestamps in a Brazilian-locale "YYYY-MM-DD HH:mm:ss"
 * shape without timezone. We treat the value as UTC (D4Sign is São Paulo
 * timezone in practice but does not document the offset on the wire; the
 * conservative read is UTC so downstream consumers do not silently
 * mis-attribute hours). Callers can adjust at the integration layer if
 * needed.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // Try direct parse first.
  let d = new Date(str)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  // Convert "YYYY-MM-DD HH:mm:ss" → ISO by inserting 'T' + 'Z'.
  const m = str.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/)
  if (m) {
    d = new Date(`${m[1]}T${m[2]}Z`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}
