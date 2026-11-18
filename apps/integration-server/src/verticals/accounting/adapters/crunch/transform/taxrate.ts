import type { TaxRate } from '../../../schema/taxrate'

// ── Crunch wire types ─────────────────────────────────────────────────────────

/** VatType entry from GET /expenses/vat-types or GET /invoices/vat-types */
export interface CrunchVatType {
  name?: string
  displayName?: string
  vatPercent?: number
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: CrunchVatType): TaxRate {
  return {
    id: raw.name ?? undefined,
    name: raw.displayName ?? raw.name ?? undefined,
    rate: raw.vatPercent !== undefined ? raw.vatPercent : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
