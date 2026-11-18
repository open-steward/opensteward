import { toIsoDatetime } from '@opensteward/shared'

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

/** Strict ISO-8601 normalisation for every datetime assignment. */
export const toIso = toIsoDatetime

/** A single Notion rich-text token — only `plain_text` is load-bearing here. */
export interface NotionRichText {
  type?: string
  plain_text?: string
}

/**
 * Flatten a Notion rich-text array (used for titles, descriptions, comment
 * bodies, rich_text property values) into a plain string. Returns undefined
 * when the input is empty or not an array.
 */
export function richTextToPlain(rich: unknown): string | undefined {
  if (!Array.isArray(rich)) return undefined
  const text = rich
    .map((t) => (t && typeof t === 'object' ? (t as NotionRichText).plain_text ?? '' : ''))
    .join('')
  return text.length > 0 ? text : undefined
}
