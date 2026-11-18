import type { TaxRate } from '../../../schema/taxrate'

export interface ChipaxTaxRate {
  id: number
  nombre: string
  descripcion: string
  tasa: number
  activo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ChipaxTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.nombre || undefined,
    description: raw.descripcion || undefined,
    rate: raw.tasa,
    isActive: raw.activo,
    metadata: raw as Record<string, unknown>,
  }
}
