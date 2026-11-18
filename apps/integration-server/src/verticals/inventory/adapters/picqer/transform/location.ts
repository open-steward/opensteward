import type { Location } from '../../../schema/location'
import {pickBool, strMap} from './shared'

/**
 * Raw warehouse object from GET /warehouses or GET /warehouses/{idwarehouse}.
 *
 * Field reference: https://picqer.com/en/api/warehouses
 * Picqer warehouses do not expose address fields via the API.
 */
export interface RawPicqerWarehouse {
  idwarehouse: number
  name: string
  accept_orders: boolean
  counts_for_general_stock: boolean
  priority?: number
  active?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawPicqerWarehouse): Location {
  const idStr = String(raw.idwarehouse)
  return {
    id: idStr,
    externalId: idStr,
    name: raw.name,
    type: 'warehouse',
    isActive: pickBool(raw.active) ?? true,
    platform: 'picqer',
    metadata: strMap({
      accept_orders: raw.accept_orders,
      counts_for_general_stock: raw.counts_for_general_stock,
      priority: raw.priority,
    }),
    raw,
  }
}
