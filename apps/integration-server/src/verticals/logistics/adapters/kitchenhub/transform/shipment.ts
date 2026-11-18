import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

/**
 * A delivery as `GET /v2/deliveries/` ({ deliveries }) and
 * `GET /v2/deliveries/{delivery_id}/` return it, schema
 * DeliveryResponseSerializer
 * (https://kitchenhub.readme.io/reference/get_v2-deliveries.md).
 *
 * Only fields that the OpenAPI schema and the Deliveries API guide
 * (https://kitchenhub.readme.io/reference/deliveries-api.md) agree on are
 * read. Where they name a field differently (`delivery_service` vs
 * `delivery_provider_id`, `dropoff_time_estimated` vs `estimated_dropoff_at`,
 * `canceled_at` vs `cancelled_at`) the value stays in metadata. The charges
 * carry no currency, so no cost is mapped.
 */
export interface KitchenHubDelivery {
  delivery_id: string
  order_id?: string | null
  store_id?: string | null
  delivery_order_id?: string | null
  status?: string | null
  created_at?: string | null
  delivery_at?: string | null
  drop_off_info?: { drop_off_notes?: string | null; [key: string]: unknown } | null
  [key: string]: unknown
}

/**
 * DeliveryStatus: "new", "placed", "enroute", "arrived", "delivered",
 * "cancelled", "returned". The guide: new "Delivery created, awaiting
 * courier assignment"; placed "Courier dispatched"; arrived "Courier at the
 * pickup location"; enroute "Courier picked up the order, heading to
 * customer"; delivered "Order delivered"; cancelled "Delivery cancelled".
 */
function mapDeliveryStatus(s: string | null | undefined): ShipmentStatus {
  switch (s) {
    case 'new':
    case 'placed':
    case 'arrived':
      return 'PENDING'
    case 'enroute':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
      return 'CANCELLED'
    case 'returned':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformDelivery(raw: KitchenHubDelivery): Shipment {
  return {
    id: raw.delivery_id,
    status: mapDeliveryStatus(raw.status),
    trackingNumber: raw.delivery_order_id ?? undefined,
    warehouseId: raw.store_id ?? undefined,
    reference: raw.order_id ?? undefined,
    notes: raw.drop_off_info?.drop_off_notes ?? undefined,
    actualDeliveryAt: toISODate(raw.delivery_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
