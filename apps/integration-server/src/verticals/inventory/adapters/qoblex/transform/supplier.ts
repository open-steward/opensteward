/**
 * Transform a Qoblex supplier entry into canonical Supplier.
 *
 * Source: GET /v1/suppliers
 * Schema: Qoblex.Api.Suppliers.Dto.SupplierDto
 *
 * Note: the Qoblex supplier list endpoint returns only id + name.
 * Richer fields (currency, lead time) are available per-variant via
 * GET /v1/variants/{id}/suppliers but are outside the bulk-list surface.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawQoblexSupplier {
  id: number
  name?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawQoblexSupplier): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    isActive: true, // Qoblex API only returns active suppliers in the list
    platform: 'qoblex',
    metadata: strMap({}),
    raw,
  }
}
