/**
 * AFAS Profit_VAT_code GetConnector → canonical TaxRate transform.
 *
 * Fields returned by Profit_VAT_code:
 *   VatCode        — VAT code identifier
 *   VatDescription — description of the VAT rule
 *   VatPercent     — percentage rate (e.g. 21 for 21%)
 *   VatIsActive    — whether the code is currently in use
 */
import type { TaxRate } from '../../../schema/taxrate'

export interface AfasVatCode {
  VatCode: string
  VatDescription: string
  VatPercent: number
  VatIsActive: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AfasVatCode): TaxRate {
  return {
    id: raw.VatCode,
    name: raw.VatDescription || undefined,
    description: raw.VatDescription || undefined,
    rate: raw.VatPercent,
    isActive: raw.VatIsActive ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
