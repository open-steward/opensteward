/** A non-empty string, or undefined. Numbers are stringified; anything else is dropped. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    const s = pickStr(v)
    if (s !== undefined) out[k] = s
  }
  return out
}
