import type { TaxRate } from '../../../schema/taxrate'

export interface FikenTaxRate {
  vatType: string
  description: string
  percentage: number
  active: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FikenTaxRate): TaxRate {
  return {
    id: raw.vatType,
    name: raw.vatType || undefined,
    description: raw.description || undefined,
    rate: raw.percentage / 100,
    isActive: raw.active,
    metadata: raw as Record<string, unknown>,
  }
}
