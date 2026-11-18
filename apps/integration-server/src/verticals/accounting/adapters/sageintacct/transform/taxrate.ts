import type { TaxRate } from '../../../schema/taxrate'

export interface IntacctTaxRate {
  RECORDNO: string
  NAME: string
  DESCRIPTION: string
  RATE: string
  STATUS: 'active' | 'inactive'
  [key: string]: unknown
}

export function transformTaxRate(raw: IntacctTaxRate): TaxRate {
  return {
    id: raw.RECORDNO,
    name: raw.NAME || undefined,
    description: raw.DESCRIPTION || undefined,
    rate: parseFloat(raw.RATE),
    isActive: raw.STATUS === 'active',
    metadata: raw as Record<string, unknown>,
  }
}
