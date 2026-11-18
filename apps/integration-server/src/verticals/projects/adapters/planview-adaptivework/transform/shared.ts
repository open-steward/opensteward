import { toIsoDatetime } from '@opensteward/shared'

/** Coerce to a non-empty string, or undefined. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v == null) return undefined
  const s = String(v)
  return s.length > 0 ? s : undefined
}

/** Coerce to a finite number, or undefined. */
export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Build a `Record<string,string>` metadata map, dropping null/undefined/objects. */
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

/** Strict ISO-8601, or undefined for unparseable/missing values. Never throws. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

/**
 * An AdaptiveWork reference field is `{ id: "/User/<uuid>", Name?: "…" }`.
 * `refId` returns the full `id` URI (the canonical id form used throughout this
 * adapter); `refName` returns the eagerly-fetched `Name` when present.
 */
export interface CzReference {
  id?: string
  Name?: string
  [key: string]: unknown
}

export function refId(ref: unknown): string | undefined {
  if (!ref || typeof ref !== 'object') return undefined
  return pickStr((ref as CzReference).id)
}

export function refName(ref: unknown): string | undefined {
  if (!ref || typeof ref !== 'object') return undefined
  return pickStr((ref as CzReference).Name)
}

/**
 * Extract the bare UUID from an AdaptiveWork entity id URI (`/Project/<uuid>` →
 * `<uuid>`). Used to build `data/objects/{TypeName}/{uuid}` GET paths. A value
 * with no slash is returned unchanged.
 */
export function idUuid(id: string): string {
  const idx = id.lastIndexOf('/')
  return idx === -1 ? id : id.slice(idx + 1)
}
