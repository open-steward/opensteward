import { z } from 'zod'

export function pickStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
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

export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

const Email = z.email()

/**
 * A participant's `email` is "The email address of the participant or the
 * temporary ID of the unknown participant" (e.g. `$UnknownParticipant`), so
 * it is an e-mail only when it parses as one.
 */
export function emailOrUndefined(v: unknown): string | undefined {
  const s = pickStr(v)
  return s !== undefined && Email.safeParse(s).success ? s : undefined
}

/**
 * Participants and documents are identified only within their transaction
 * (participants by e-mail or temporary ID, documents by a short `doc_…` id), so
 * the canonical id prefixes the transaction id: `<transactionId>:<id>`.
 */
export function scopedId(transactionId: string, id: string): string {
  return `${transactionId}:${id}`
}

/** Split a {@link scopedId} at its first `:` (transaction ids carry none). */
export function splitScopedId(id: string, what: string): [string, string] {
  const at = id.indexOf(':')
  if (at <= 0 || at === id.length - 1) {
    throw Object.assign(
      new Error(`Universign ${what} id must have the shape "<transactionId>:<id>" (got "${id}")`),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return [id.slice(0, at), id.slice(at + 1)]
}
