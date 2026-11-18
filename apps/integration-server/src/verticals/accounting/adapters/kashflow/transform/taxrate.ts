import type { TaxRate } from '../../../schema/taxrate'

// KashFlow REST API v2 — Tax (VAT) rates
// Endpoint: GET /taxes (or /taxes?type=supply|purchase)
// Docs: https://www.kashflow.com/developers/rest-api/tax-list/

export interface KashflowTax {
  Code?: string
  Description?: string
  Id?: number
  Rate?: number
  [key: string]: unknown
}

/**
 * The canonical id of a tax: its Code, or its Id when it has no Code. Invoice
 * and purchase lines refer to a tax by `TaxCode`. A null Id (KashFlow sends
 * nulls freely) counts as no Id rather than becoming the id 'null'.
 */
export function kashflowTaxId(raw: KashflowTax): string | undefined {
  return raw.Code ?? (raw.Id != null ? String(raw.Id) : undefined)
}

export function transformTaxRate(raw: KashflowTax): TaxRate {
  return {
    id: kashflowTaxId(raw),
    name: raw.Description || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
