/**
 * Helpers shared across Stripe transform files. Stripe represents money as
 * integer minor units already, so no float-coercion needed. Most fields are
 * snake_case → camelCase plus null → undefined collapses.
 */

export function toIso(unix: number | null | undefined): string | undefined {
  if (unix == null) return undefined
  return new Date(unix * 1000).toISOString()
}

export function fromIso(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined
  return Math.floor(new Date(iso).getTime() / 1000)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (v == null) return undefined
  return Number(v)
}
