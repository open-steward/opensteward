import type { TaxRate } from '../../../schema/taxrate'

export interface AccountingSeedTaxRate {
  Id: string
  Name: string
  AcctSeed__Description__c: string
  AcctSeed__Rate__c: number
  AcctSeed__Active__c: boolean
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

export function transformTaxRate(raw: AccountingSeedTaxRate): TaxRate {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.AcctSeed__Description__c || undefined,
    rate: raw.AcctSeed__Rate__c ?? undefined,
    isActive: raw.AcctSeed__Active__c ?? undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
