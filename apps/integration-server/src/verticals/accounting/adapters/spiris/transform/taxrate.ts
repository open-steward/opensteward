import type { TaxRate } from '../../../schema/taxrate'

export interface SpirisTaxRate {
  Id: string
  Code: string
  Description: string
  Percentage: number
  IsActive: boolean
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

export function transformTaxRate(raw: SpirisTaxRate): TaxRate {
  return {
    id: raw.Id,
    name: raw.Code || undefined,
    description: raw.Description || undefined,
    rate: raw.Percentage,
    isActive: raw.IsActive,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
