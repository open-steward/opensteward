/**
 * Saasu tax code → canonical TaxRate.
 *
 * GET TaxCodes returns `TaxCodesResponse { TaxCodes[], _links[] }` of
 * `TaxCodeSummary`; GET TaxCode/{id} returns the `TaxCodeDetail` at the top
 * level (https://api.saasu.com/Help/Api/GET-TaxCodes,
 * https://api.saasu.com/Help/Api/GET-TaxCode-id, fetched 2026-09-29):
 *
 *   Id ("The Id/key of this resource") → id — the key GET TaxCode/{id} takes
 *   Name → name, Notes (detail only) → description, IsActive → isActive
 *   Rate ("The rate associated with this tax code", decimal) → rate
 *   CreatedDateUtc / LastModifiedDateUtc → createdAt / updatedAt
 *
 * `Rate` is a fraction: the documented sample gives "Sale Inc GST" (code G1,
 * Australian GST at 10%) a `Rate` of 0.1. The canonical rate is a percentage
 * (its example is 8.75), so it is multiplied by 100 and rounded to clear
 * binary noise. `Code` ("The actual tax code", e.g. "G1") is kept in metadata.
 */
import type { TaxRate } from '../../../schema/taxrate'
import { toUtcDate } from '../../shared/transform'

export interface SaasuTaxCode {
  Id: number
  Code?: string | null
  Name?: string | null
  Rate?: number | null
  IsActive?: boolean | null
  Notes?: string | null
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  [key: string]: unknown
}

/** 0.1 → 10, to six decimal places. */
function fractionToPercent(fraction: number | null | undefined): number | undefined {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return undefined
  return Math.round(fraction * 1e8) / 1e6
}

export function transformTaxRate(raw: SaasuTaxCode): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    description: raw.Notes || undefined,
    rate: fractionToPercent(raw.Rate),
    isActive: typeof raw.IsActive === 'boolean' ? raw.IsActive : undefined,
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
