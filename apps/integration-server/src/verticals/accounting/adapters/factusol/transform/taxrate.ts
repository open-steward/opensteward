/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface FactusolTaxRate {
  id: string
  nombre: string
  descripcion: string
  porcentaje: number
  activo: boolean
  [key: string]: unknown
}

export function transformTaxRate(raw: FactusolTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.nombre || undefined,
    description: raw.descripcion || undefined,
    rate: raw.porcentaje,
    isActive: raw.activo,
    metadata: raw as Record<string, unknown>,
  }
}
