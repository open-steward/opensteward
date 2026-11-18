/**
 * Helpers + shared raw types for the Viafirma Documents transforms.
 *
 * Viafirma returns timestamps as epoch-millisecond integers
 * (`creationDate`, `updateDate`, `expirationDate`) which `toIsoDatetime`
 * normalises to strict ISO-8601. Transforms never throw — missing optional
 * fields resolve to `undefined`.
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

/** Strict ISO-8601 from Viafirma's epoch-millis (or any) timestamp. */
export const toIso = toIsoDatetime

/**
 * A Viafirma recipient ("link" on the SET summary). Recipients carry the
 * `messageCode` that addresses their per-recipient signing message.
 */
export interface RawViafirmaLink {
  key?: string
  messageCode?: string
  status?: string
  mail?: string
  name?: string
  phone?: string
  userCode?: string
  order?: number
  [key: string]: unknown
}

/** A Viafirma message (one per recipient-document) nested on the SET. */
export interface RawViafirmaMessage {
  code?: string
  title?: string
  status?: string
  recipientStatus?: string
  templateCode?: string
  creationDate?: number
  responseDate?: number
  policies?: Array<{
    evidences?: Array<{ type?: string; status?: string; code?: string }>
    signatures?: Array<{ type?: string; status?: string; code?: string }>
  }>
  [key: string]: unknown
}

/** The Viafirma SET summary object (canonical Envelope source). */
export interface RawViafirmaSet {
  code: string
  status?: string
  title?: string
  description?: string
  externalCode?: string
  externalStatus?: string
  groupCode?: string
  groupTitle?: string
  userCode?: string
  userName?: string
  creationDate?: number
  updateDate?: number
  expirationDate?: number
  links?: RawViafirmaLink[]
  messages?: RawViafirmaMessage[]
  [key: string]: unknown
}
