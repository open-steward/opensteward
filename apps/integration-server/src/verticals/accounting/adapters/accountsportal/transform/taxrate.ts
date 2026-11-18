import type { TaxRate } from '../../../schema/taxrate'

// AccountsPortal tax rate wire shape
export interface APTaxRate {
  id: number
  name: string
  description: string | null
  rate: number            // percentage, e.g. 20 for 20%
  is_active: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformTaxRate(raw: APTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.is_active,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
