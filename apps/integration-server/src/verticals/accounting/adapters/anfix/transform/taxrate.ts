import type { TaxRate } from '../../../schema/taxrate'

export interface AnfixTaxRate {
  id: string
  nombre: string
  descripcion: string
  porcentaje: number
  activo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: AnfixTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.nombre || undefined,
    description: raw.descripcion || undefined,
    rate: raw.porcentaje,
    isActive: raw.activo,
    metadata: raw as Record<string, unknown>,
  }
}
