import type { TaxRate } from '../../../schema/taxrate'

export interface BCTaxGroup {
  id: string
  code: string
  displayName: string
  lastModifiedDateTime?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: BCTaxGroup): TaxRate {
  return {
    id: raw.id,
    name: raw.displayName || raw.code || undefined,
    description: raw.displayName || undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
