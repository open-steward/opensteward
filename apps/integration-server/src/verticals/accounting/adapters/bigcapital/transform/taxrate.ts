import type { TaxRate } from '../../../schema/taxrate'

export interface BigcapitalTaxRate {
  id: number
  name: string
  code?: string
  rate: number
  description?: string
  isNonRecoverable?: boolean
  isCompound?: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BigcapitalTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.active ?? true,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
