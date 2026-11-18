/**
 * Transform Abacus ERP VAT/tax-rate records to the canonical TaxRate schema.
 *
 * Abacus exposes tax codes through the OData entity set "TaxCodes" or "VatCodes".
 *
 * Key Abacus tax code fields:
 *   Id          – numeric string primary key
 *   Code        – short tax code (e.g. "MWS81", "NOS")
 *   Name        – descriptive name
 *   Rate        – percentage rate as a decimal (e.g. 8.1 for 8.1%)
 *   IsActive    – boolean
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { TaxRate } from '../../../schema/taxrate'

// ── Abacus payload type ───────────────────────────────────────────────────────

export interface AbacusTaxCode {
  Id: string | number
  Code?: string
  Name?: string
  Description?: string
  Rate?: number
  IsActive?: boolean
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus tax code OData record to the canonical TaxRate type. */
export function transformTaxRate(raw: AbacusTaxCode): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Name || raw.Code || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
