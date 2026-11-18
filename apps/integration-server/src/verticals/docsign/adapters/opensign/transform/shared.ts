/**
 * Helpers shared across OpenSign transform files.
 *
 * OpenSign is a Parse-Server-backed API: timestamps appear either as a Parse
 * date wrapper (`{ __type: 'Date', iso: '2026-01-15T09:30:00.000Z' }`) or as
 * a plain ISO / `createdAt`-style string. `toIso` unwraps the Parse shape
 * first, then defers to the shared strict ISO-8601 coercer. All helpers
 * return undefined (never throw) for missing or unparseable input.
 */
import { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'object') return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
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

/** Unwrap a Parse `{ __type: 'Date', iso }` wrapper or pass strings through. */
function unwrapDate(v: unknown): unknown {
  if (v && typeof v === 'object' && '__type' in (v as Record<string, unknown>)) {
    const obj = v as { __type?: unknown; iso?: unknown }
    if (obj.__type === 'Date' && typeof obj.iso === 'string') return obj.iso
  }
  return v
}

export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(unwrapDate(v))
}
