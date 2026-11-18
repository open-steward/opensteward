import type { TaxRate } from '../../../schema/taxrate'

export interface FreeAgentTaxRate {
  url: string
  name: string
  percentage: string
  is_default: boolean
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformTaxRate(raw: FreeAgentTaxRate): TaxRate {
  return {
    id: extractId(raw.url),
    name: raw.name || undefined,
    rate: parseFloat(raw.percentage),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
