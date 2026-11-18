import type { TaxRate } from '../../../schema/taxrate'

export interface MyunisoftTaxRate {
  id: string
  nom: string
  description: string
  taux: number
  actif: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: MyunisoftTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.nom || undefined,
    description: raw.description || undefined,
    rate: raw.taux,
    isActive: raw.actif,
    metadata: raw as Record<string, unknown>,
  }
}
