import type { TaxRate } from '../../../schema/taxrate'

export interface EcountVatCode {
  VAT_CODE: string
  VAT_NAME?: string
  VAT_RATE?: number
  USE_YN?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: EcountVatCode): TaxRate {
  return {
    id: raw.VAT_CODE,
    name: raw.VAT_NAME || undefined,
    description: raw.VAT_NAME || undefined,
    rate: raw.VAT_RATE ?? 0,
    isActive: raw.USE_YN === 'Y',
    metadata: raw as Record<string, unknown>,
  }
}
