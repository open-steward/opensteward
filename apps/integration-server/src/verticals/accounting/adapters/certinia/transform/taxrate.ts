import type { TaxRate } from '../../../schema/taxrate'

export interface CertiniaTaxRate {
  Id: string
  Name: string
  Rate__c: number
  IsActive__c: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: CertiniaTaxRate): TaxRate {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    rate: raw.Rate__c,
    isActive: raw.IsActive__c ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
