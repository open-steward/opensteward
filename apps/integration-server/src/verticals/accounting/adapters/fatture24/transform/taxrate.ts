import type { TaxRate } from '../../../schema/taxrate'

export interface Fatture24AliquotaIva {
  id: string
  Codice: string
  Descrizione: string
  Percentuale: number
  Attivo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: Fatture24AliquotaIva): TaxRate {
  return {
    id: String(raw.id),
    name: raw.Descrizione || undefined,
    description: raw.Descrizione || undefined,
    rate: raw.Percentuale,
    isActive: raw.Attivo,
    metadata: raw as Record<string, unknown>,
  }
}
