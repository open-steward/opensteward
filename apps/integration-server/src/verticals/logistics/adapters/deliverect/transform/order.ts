import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// Deliverect channel order payload
export interface DeliverectOrder {
  _id?: string | null
  channelOrderId?: string | null
  channelOrderDisplayId?: string | null
  status?: number | string | null
  accountId?: string | null
  channelLinkId?: string | null
  customer?: Record<string, unknown> | null
  pickupAddress?: Record<string, unknown> | null
  deliveryAddress?: Record<string, unknown> | null
  items?: Array<Record<string, unknown>> | null
  price?: number | null
  subTotalPrice?: number | null
  deliveryFee?: number | null
  discountTotal?: number | null
  taxAmount?: number | null
  currency?: string | null
  note?: string | null
  serviceType?: number | string | null
  estimatedDeliveryTime?: string | null
  orderAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

/**
 * Deliverect order status codes:
 *  1  = NEW / PENDING
 *  2  = RECEIVED (accepted by POS)
 *  3  = STARTED (preparation started)
 *  4  = READY (ready for pickup/dispatch)
 *  5  = DISPATCHED (out for delivery)
 *  6  = DELIVERED
 *  100 = FAILED_TO_SEND
 *  101 = CANCELLED
 *  110 = CANCELLED (by restaurant)
 */
function mapStatus(s: number | string | null | undefined): OrderStatus {
  const code = typeof s === 'string' ? parseInt(s, 10) : (s ?? 0)
  switch (code) {
    case 1:
      return 'PENDING'
    case 2:
    case 3:
      return 'PROCESSING'
    case 4:
      return 'AWAITING_SHIPMENT'
    case 5:
      return 'SHIPPED'
    case 6:
      return 'DELIVERED'
    case 101:
    case 110:
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

export function transformOrder(raw: DeliverectOrder): Order {
  return {
    id: raw._id ?? raw.channelOrderId ?? undefined,
    status: mapStatus(raw.status),
    orderNumber: raw.channelOrderDisplayId ?? raw.channelOrderId ?? undefined,
    customerId: raw.accountId ?? undefined,
    warehouseId: raw.channelLinkId ?? undefined,
    originAddress: toAddress(raw.pickupAddress ?? null),
    destinationAddress: toAddress(raw.deliveryAddress ?? null),
    lineItems: Array.isArray(raw.items)
      ? raw.items.map((item) => ({
          id: (item['_id'] as string | undefined) ?? undefined,
          sku: (item['plu'] as string | undefined) ?? undefined,
          name: (item['name'] as string | undefined) ?? undefined,
          quantity: typeof item['quantity'] === 'number' ? item['quantity'] : undefined,
          unitAmount: typeof item['price'] === 'number' ? item['price'] : undefined,
          totalAmount: typeof item['totalPrice'] === 'number' ? item['totalPrice'] : undefined,
        }))
      : undefined,
    currency: (raw.currency as string | undefined) ?? undefined,
    subtotalAmount: raw.subTotalPrice ?? undefined,
    taxAmount: raw.taxAmount ?? undefined,
    shippingAmount: raw.deliveryFee ?? undefined,
    discountAmount: raw.discountTotal ?? undefined,
    totalAmount: raw.price ?? undefined,
    notes: raw.note ?? undefined,
    orderAt: toISODate(raw.orderAt ?? raw.created),
    shippedAt: toISODate(raw.shippedAt),
    deliveredAt: toISODate(raw.deliveredAt),
    cancelledAt: toISODate(raw.cancelledAt),
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
