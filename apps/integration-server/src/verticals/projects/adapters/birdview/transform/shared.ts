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

export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
