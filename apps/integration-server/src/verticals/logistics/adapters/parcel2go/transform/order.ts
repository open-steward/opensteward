import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import { transformAddress, type Parcel2GoAddress } from './address'

/**
 * Parcel2Go order response.
 * Returned by POST /api/order
 */
export interface Parcel2GoOrderResponse {
  /** Parcel2Go internal order ID. */
  OrderId?: string | null
  /** Validation hash (required for label retrieval). */
  Hash?: string | null
  /** Map of order line IDs — key is "1", value is the orderline ID string. */
  OrderlineIdMap?: Record<string, string> | null
  /** Total price paid. */
  TotalPrice?: number | string | null
  /** Primary order line ID. */
  OrderLineId?: string | null
  /** Collection address object stored for reference. */
  CollectionAddress?: Parcel2GoAddress | null
  /** Delivery address object stored for reference. */
  DeliveryAddress?: Parcel2GoAddress | null
  /** ISO datetime string when order was placed. */
  CreatedAt?: string | null
  /** Service slug used. */
  Slug?: string | null
  [key: string]: unknown
}

export function transformOrder(raw: Parcel2GoOrderResponse): Order {
  // Collect all orderline IDs from the map
  const shipmentIds = raw.OrderlineIdMap
    ? Object.values(raw.OrderlineIdMap).filter(Boolean)
    : raw.OrderLineId
      ? [raw.OrderLineId]
      : undefined

  return {
    id: raw.OrderId ?? undefined,
    orderNumber: raw.OrderId ?? undefined,
    requestedServiceCode: raw.Slug ?? undefined,
    originAddress: raw.CollectionAddress ? transformAddress(raw.CollectionAddress) : undefined,
    destinationAddress: raw.DeliveryAddress ? transformAddress(raw.DeliveryAddress) : undefined,
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    createdAt: toISODate(raw.CreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
