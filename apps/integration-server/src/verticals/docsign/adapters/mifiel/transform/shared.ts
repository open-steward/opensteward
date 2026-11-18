export function pickStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function toIso(s: unknown): string | undefined {
  if (typeof s !== 'string' || s === '') return undefined
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
