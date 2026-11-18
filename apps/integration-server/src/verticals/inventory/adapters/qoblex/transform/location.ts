/**
 * Transform a Qoblex location entry into canonical Location.
 *
 * Source: GET /v1/account/locations
 * Schema: Qoblex.Api.Account.Dtos.LocationDto
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawQoblexLocation {
  id: number
  name?: string
  available_in_purchase_orders?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawQoblexLocation): Location {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    type: 'warehouse',
    isActive: true, // Qoblex API only returns active locations
    platform: 'qoblex',
    metadata: strMap({
      availableInPurchaseOrders: raw.available_in_purchase_orders,
    }),
    raw,
  }
}
