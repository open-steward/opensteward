/**
 * MRI Software — Tax Rate transform.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface MriTaxRate {
  id: string
  name?: string
  description?: string
  rate?: number
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: MriTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
