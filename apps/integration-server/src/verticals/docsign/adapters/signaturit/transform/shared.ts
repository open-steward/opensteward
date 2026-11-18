export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  return undefined
}

export function pickNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  // Signaturit dates look like "2014-08-21T08:53:35+0000".
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** A documented field the canonical schema requires: read it or throw. */
export function requireStr(v: unknown, what: string): string {
  const s = pickStr(v)
  if (s === undefined) throw new Error(`Signaturit response is missing ${what}`)
  return s
}
