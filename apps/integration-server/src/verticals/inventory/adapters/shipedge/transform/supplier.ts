import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * ShipEdge supplier record derived from replenishment (PO) data.
 *
 * ShipEdge does not expose a dedicated supplier-list endpoint in the public
 * API. Supplier data is available as the `supplier_name` string on
 * replenishment records. This transform normalises those name-keyed entries
 * into a canonical Supplier shape.
 */
export interface RawShipEdgeSupplier {
  /** Used as the stable ID (name-based since no numeric ID is returned). */
  supplier_name: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawShipEdgeSupplier): Supplier {
  const id = pickStr(raw.supplier_name) ?? ''
  return {
    id,
    externalId: id,
    name: id,
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: true,
    platform: 'shipedge',
    metadata: strMap({}),
    raw,
  }
}
