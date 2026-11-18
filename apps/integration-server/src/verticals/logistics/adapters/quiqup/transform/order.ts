import type { Order } from '../../../schema/order'
import { toISODate, nonempty, parseDecimal } from '../../shared/transform'
import { transformAddress, type QuiqupAddress } from './address'

/**
 * Quiqup order — the top-level fulfilment unit that groups one or more
 * delivery jobs.  This maps to the canonical Order schema.
 */
export interface QuiqupOrder {
  id: string
  reference?: string | null
  external_reference?: string | null
  status?: string | null
  pickup_address?: QuiqupAddress | null
  delivery_address?: QuiqupAddress | null
  job_ids?: string[] | null
  currency?: string | null
  subtotal_amount?: number | null
  tax_amount?: number | null
  shipping_amount?: number | null
  discount_amount?: number | null
  total_amount?: number | null
  notes?: string | null
  service_type?: string | null
  ordered_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(
  status: string | null | undefined,
): Order['status'] {
  switch (status) {
    case 'pending':
    case 'created':
      return 'PENDING'
    case 'processing':
    case 'accepted':
      return 'PROCESSING'
    case 'on_hold':
      return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'ready_for_collection':
      return 'AWAITING_SHIPMENT'
    case 'shipped':
    case 'in_transit':
    case 'collected':
      return 'SHIPPED'
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrder(raw: QuiqupOrder): Order {
  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.reference ?? raw.external_reference ?? undefined,
    originAddress: transformAddress(raw.pickup_address),
    destinationAddress: transformAddress(raw.delivery_address),
    shipmentIds: nonempty(raw.job_ids ?? undefined),
    currency: raw.currency ?? undefined,
    subtotalAmount: parseDecimal(raw.subtotal_amount),
    taxAmount: parseDecimal(raw.tax_amount),
    shippingAmount: parseDecimal(raw.shipping_amount),
    discountAmount: parseDecimal(raw.discount_amount),
    totalAmount: parseDecimal(raw.total_amount),
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_type ?? undefined,
    orderAt: toISODate(raw.ordered_at),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
