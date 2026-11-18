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

/** Strict ISO-8601 normalisation. Never throws — drops unparseable input. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

/** A HAL+JSON link: `{ href, title }`. `href` may be null for empty links. */
export interface HalLink {
  href?: string | null
  title?: string | null
}

/**
 * Extract the trailing identifier from a HAL `_links.x.href` such as
 * `/api/v3/statuses/1` → `"1"`. Returns undefined for empty/missing links.
 * OpenProject never embeds bare ids on resources — every relation is a link,
 * so this is the canonical way to resolve a foreign key.
 */
export function linkId(link: HalLink | undefined | null): string | undefined {
  const href = link?.href
  if (typeof href !== 'string' || href.length === 0) return undefined
  const seg = href.split('/').filter(Boolean).pop()
  return seg && seg.length > 0 ? decodeURIComponent(seg) : undefined
}

/** The human-readable title carried alongside a HAL link, if any. */
export function linkTitle(link: HalLink | undefined | null): string | undefined {
  return pickStr(link?.title ?? undefined)
}
