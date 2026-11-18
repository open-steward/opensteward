import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Billbee StockResponseData — returned by GET /products/stocks.
 * Represents a named warehouse / fulfillment location.
 */
export interface RawBillbeeLocation {
  /** Billbee stock/warehouse ID */
  Id?: number
  /** Display name of the warehouse */
  Name?: string
  /** Optional description */
  Description?: string
  /** Whether this is the default warehouse */
  IsDefault?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawBillbeeLocation): Location {
  const id = String(raw.Id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    type: 'warehouse',
    isActive: true,
    platform: 'billbee',
    metadata: strMap({
      description: raw.Description,
      isDefault: raw.IsDefault,
    }),
    raw,
  }
}
