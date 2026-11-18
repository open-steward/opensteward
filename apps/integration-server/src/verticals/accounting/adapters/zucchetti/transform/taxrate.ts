import type { TaxRate } from '../../../schema/taxrate'

export interface ZucchettiAliquotaIva {
  id: string
  codice: string
  descrizione: string
  percentuale: number
  attivo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ZucchettiAliquotaIva): TaxRate {
  return {
    id: String(raw.id),
    name: raw.descrizione || undefined,
    description: raw.descrizione || undefined,
    rate: raw.percentuale,
    isActive: raw.attivo,
    metadata: raw as Record<string, unknown>,
  }
}
