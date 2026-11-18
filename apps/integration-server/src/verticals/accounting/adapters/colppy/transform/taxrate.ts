import type { TaxRate } from '../../../schema/taxrate'

export interface ColppyTaxRate {
  idAlicuota: number
  nombre: string
  descripcion: string
  porcentaje: number
  activa: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: ColppyTaxRate): TaxRate {
  return {
    id: String(raw.idAlicuota),
    name: raw.nombre || undefined,
    description: raw.descripcion || undefined,
    rate: raw.porcentaje,
    isActive: raw.activa,
    metadata: raw as Record<string, unknown>,
  }
}
