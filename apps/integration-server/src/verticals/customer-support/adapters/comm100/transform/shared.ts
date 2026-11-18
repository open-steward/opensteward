export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

export function toIso(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s) return undefined
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** A required field the docs name, or a throw naming it: never a made-up value. */
export function required(v: string | undefined, what: string): string {
  if (v === undefined) throw new Error(`comm100 ${what} is missing from the response`)
  return v
}

/**
 * Comm100 body text, decoded when base64. Documented on Message.body and
 * Agent.bio: "You can pass both plaintext and base64 encoded text ... When
 * using base64, add "data:text/plain;base64," before the content."
 */
const BASE64_PREFIX = 'data:text/plain;base64,'
export function decodeBody(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  if (!v.startsWith(BASE64_PREFIX)) return v
  return Buffer.from(v.slice(BASE64_PREFIX.length), 'base64').toString('utf8')
}
