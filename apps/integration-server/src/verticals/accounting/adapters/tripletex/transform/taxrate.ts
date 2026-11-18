import type { TaxRate } from '../../../schema/taxrate'

export interface TripletexVATType {
  id: number
  name: string
  number: string
  percentage: number
  [key: string]: unknown
}

export function transformTaxRate(raw: TripletexVATType): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.number || undefined,
    rate: raw.percentage,
    metadata: raw as Record<string, unknown>,
  }
}
