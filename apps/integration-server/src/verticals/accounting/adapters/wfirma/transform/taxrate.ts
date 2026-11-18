/**
 * wFirma vat_codes → canonical TaxRate.
 *
 * wFirma exposes VAT codes (Polish VAT rates) under the `vat_codes` resource.
 * Endpoint: GET /vat_codes/get/{id}, POST /vat_codes/find
 *
 * Docs: https://doc.wfirma.pl/ (vat_codes module)
 * SDK reference: https://github.com/dbojdo/wFirma/tree/master/src/Vat
 */

import type { TaxRate } from '../../../schema/taxrate'
import { toIsoDatetime } from '@opensteward/shared'

export interface WfirmaVatCode {
  id?: number | string
  label?: string        // human-readable name, e.g. "Stawka 23%"
  rate?: number | string // decimal rate, e.g. 23 (percent)
  code?: string         // short code, e.g. "23"
  type?: string         // e.g. "normal", "zero", "exempt"
  priority?: number | string
  created?: string
  modified?: string
  [key: string]: unknown
}

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

/** Parse a decimal number; returns undefined on absent/NaN. */
function parseDecimal(v: number | string | undefined | null): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(v as string)
  return isNaN(n) ? undefined : n
}

export function transformVatCode(raw: WfirmaVatCode): TaxRate {
  const rate = parseDecimal(raw.rate)
  // wFirma stores rate as a whole percentage (e.g. 23 = 23%). Canonical TaxRate.rate is also a percentage.
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.label || (raw.code ? `VAT ${raw.code}%` : undefined),
    description: raw.type || undefined,
    rate: rate,
    isActive: true, // wFirma does not expose an active/inactive flag on vat_codes
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
