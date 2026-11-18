/**
 * Helpers shared across eSignGlobal transform files.
 *
 * eSignGlobal returns timestamps as Unix epoch **milliseconds** (e.g.
 * `1693974363460`) — sometimes as a number, sometimes as a numeric string.
 * `toIsoDatetime` already treats values > 9_999_999_999 as epoch millis, so
 * routing every timestamp through it yields strict ISO-8601 (or undefined
 * when the value is null/unparseable, per the canonical-schema contract).
 */

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

/** eSignGlobal epoch-millis (number or numeric string) → strict ISO-8601. */
export const toIso = toIsoDatetime
