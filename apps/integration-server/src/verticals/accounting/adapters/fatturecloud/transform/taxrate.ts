import type { TaxRate } from '../../../schema/taxrate'

export interface FattureCloudTaxRate {
  id?: number | string
  value?: number
  description?: string
  is_disabled?: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FattureCloudTaxRate): TaxRate {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.description || undefined,
    rate: raw.value,
    isActive: raw.is_disabled !== true,
    metadata: raw as Record<string, unknown>,
  }
}
