import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type KarrioAddress } from './address'

/**
 * Karrio `Order` (https://docs.karrio.io/reference/openapi, schema Order):
 * id, order_id "The source' order id.", status, shipping_to, shipping_from,
 * line_items, shipments "The shipments associated with the order.", created_at.
 * It documents no order total, currency or updated_at.
 */
export interface KarrioOrder {
  id: string
  status?: string | null
  order_id?: string | null
  source?: string | null
  shipping_to?: KarrioAddress | null
  shipping_from?: KarrioAddress | null
  line_items?: Array<Record<string, unknown>>
  shipments?: Array<{ id?: string | null; [key: string]: unknown }>
  options?: Record<string, unknown> | null
  created_at?: string | null
  [key: string]: unknown
}

/** The documented Order.status enum: unfulfilled, cancelled, fulfilled, delivered, partial. */
function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'unfulfilled':
      return 'AWAITING_SHIPMENT'
    case 'partial':
      return 'PROCESSING'
    case 'fulfilled':
      return 'SHIPPED'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

export function transformOrder(raw: KarrioOrder): Order {
  const shipmentIds = nonempty(
    (raw.shipments ?? []).flatMap((s) => (typeof s.id === 'string' && s.id ? [s.id] : [])),
  )

  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_id ?? undefined,
    originAddress: raw.shipping_from ? transformAddress(raw.shipping_from) : undefined,
    destinationAddress: raw.shipping_to ? transformAddress(raw.shipping_to) : undefined,
    shipmentIds,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
