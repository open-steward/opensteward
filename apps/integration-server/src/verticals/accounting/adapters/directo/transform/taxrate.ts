/**
 * Directo VAT code transform (maps to canonical TaxRate).
 *
 * Directo does not expose a dedicated /vatcodes REST endpoint; VAT codes
 * appear as a `vatcode` field on invoice/account rows.  We model the shape
 * returned when a future /v1/vatcodes or equivalent endpoint is available,
 * consistent with Directo's own xmlcore VAT code structure.
 */
import type { TaxRate } from '../../../schema/taxrate'

// ── Directo wire type ─────────────────────────────────────────────────────────

export interface DirectoVatCode {
  code?: string      // VAT code identifier (e.g. "20")
  name?: string      // display name (e.g. "Standard VAT 20%")
  rate?: number      // percentage (e.g. 20)
  closed?: boolean | number  // 0/false=active
  [key: string]: unknown
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformTaxRate(raw: DirectoVatCode): TaxRate {
  return {
    id: raw.code || undefined,
    name: raw.name || undefined,
    description: raw.name || undefined,
    rate: raw.rate,
    isActive: raw.closed !== undefined ? !raw.closed : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
