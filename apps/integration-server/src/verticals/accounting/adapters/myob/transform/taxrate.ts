import type { TaxRate } from '../../../schema/taxrate'

export interface MyobTaxCode {
  UID?: string
  Code?: string
  Description?: string
  Rate?: number
  IsActive?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MyobTaxCode): TaxRate {
  return {
    id: raw.UID || undefined,
    name: raw.Code || undefined,
    description: raw.Description || undefined,
    rate: raw.Rate,
    isActive: raw.IsActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
