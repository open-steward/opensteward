import type { TaxRate } from '../../../schema/taxrate'

export interface ExactTaxCode {
  ID?: string
  Code?: string
  Description?: string
  VATPercentage?: number
  IsBlocked?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ExactTaxCode): TaxRate {
  return {
    id: raw.ID || undefined,
    name: raw.Code || undefined,
    description: raw.Description || undefined,
    rate: raw.VATPercentage,
    isActive: raw.IsBlocked !== true,
    metadata: raw as Record<string, unknown>,
  }
}
