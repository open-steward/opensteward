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
 * Rasayel timestamps are Unix seconds (`Int` in the GraphQL schema). The
 * `conversation.created` webhook example
 * (https://developers.rasayel.io/webhooks/conversation-created) shows
 * `"createdAt": 1652783952`, a May 2022 instant in seconds.
 */
export function epochToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}
