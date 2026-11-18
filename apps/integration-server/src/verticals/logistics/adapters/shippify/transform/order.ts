import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty, parseDecimal } from '../../shared/transform'

/**
 * Shippify order object.  An order groups one or more delivery tasks under a
 * single merchant reference and can carry line-item details.
 */
export interface ShippifyOrder {
  id: string
  status?: string | null
  ref_id?: string | null
  customer_id?: string | null
  warehouse_id?: string | null
  task_ids?: string[] | null
  // Addresses
  pickup?: Record<string, unknown> | null
  deliver?: Record<string, unknown> | null
  // Monetary
  currency?: string | null
  subtotal?: number | null
  tax?: number | null
  shipping?: number | null
  discount?: number | null
  total?: number | null
  notes?: string | null
  // Items
  items?: Array<{
    id?: string | null
    sku?: string | null
    name?: string | null
    description?: string | null
    qty?: number | null
    unit_price?: number | null
    total_price?: number | null
  }> | null
  // Timestamps
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':    return 'PENDING'
    case 'processing': return 'PROCESSING'
    case 'on_hold':    return 'ON_HOLD'
    case 'awaiting':   return 'AWAITING_SHIPMENT'
    case 'shipped':    return 'SHIPPED'
    case 'delivered':  return 'DELIVERED'
    case 'cancelled':
    case 'canceled':   return 'CANCELLED'
    case 'returned':   return 'RETURNED'
    default:           return 'UNKNOWN'
  }
}

export function transformOrder(raw: ShippifyOrder): Order {
  return {
    id: raw.id ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.ref_id ?? undefined,
    customerId: raw.customer_id ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    shipmentIds: nonempty(raw.task_ids ?? []),
    originAddress: toAddress(raw.pickup as Record<string, unknown> | null | undefined),
    destinationAddress: toAddress(raw.deliver as Record<string, unknown> | null | undefined),
    currency: (raw.currency ?? undefined) as string | undefined,
    subtotalAmount: parseDecimal(raw.subtotal),
    taxAmount: parseDecimal(raw.tax),
    shippingAmount: parseDecimal(raw.shipping),
    discountAmount: parseDecimal(raw.discount),
    totalAmount: parseDecimal(raw.total),
    notes: raw.notes ?? undefined,
    lineItems: (raw.items ?? []).map((item) => ({
      id: item.id ?? undefined,
      sku: item.sku ?? undefined,
      name: item.name ?? undefined,
      description: item.description ?? undefined,
      quantity: item.qty ?? undefined,
      unitAmount: parseDecimal(item.unit_price),
      totalAmount: parseDecimal(item.total_price),
    })),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
