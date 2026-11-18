import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Deliveroo order as returned by
 * GET /order/v2/brand/{brand_id}/restaurant/{restaurant_id}/orders
 * or the order-status webhook callback.
 *
 * Field names confirmed from the Order Status Callback docs:
 * https://api-docs.deliveroo.com/reference/signature-order-status
 */
export interface DeliverooOrderApiRaw {
  order_id?: string | null
  /** Alternatively provided as `id` in some contexts. */
  id?: string | null
  restaurant_id?: string | null
  restaurant_brand_id?: string | null
  customer_id?: string | null
  status?: string | null
  /** ISO-8601 timestamp for when the order should be prepared. */
  prepare_for?: string | null
  items?: Array<Record<string, unknown>> | null
  credit_amount?: Record<string, unknown> | null
  refund_amount?: Record<string, unknown> | null
  delivery_eta?: Record<string, unknown> | null
  customer?: Record<string, unknown> | null
  address?: Record<string, unknown> | null
  partner_fee_fractional?: number | null
  currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * Paginated list envelope from GET /order/v2/brand/.../orders.
 */
export interface DeliverooOrderListRaw {
  orders?: DeliverooOrderApiRaw[] | null
  next?: string | null
  [key: string]: unknown
}

/**
 * Map Deliveroo order status to canonical OrderStatus.
 *
 * Lifecycle: placed → accepted/confirmed → rejected/canceled → delivered
 */
function mapStatus(s: string | null | undefined): OrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'placed':
      return 'PENDING'
    case 'accepted':
    case 'confirmed':
      return 'PROCESSING'
    case 'rejected':
    case 'canceled':
    case 'cancelled':
      return 'CANCELLED'
    case 'delivered':
      return 'DELIVERED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: DeliverooOrderApiRaw): Order {
  const orderId = raw.order_id ?? raw.id ?? undefined
  const addrRaw = raw.address ?? null
  const customerRaw = raw.customer ?? null

  // Merge customer + address into a normalised address record
  const destRaw: Record<string, unknown> = {
    ...(addrRaw as Record<string, unknown> | null ?? {}),
    ...(customerRaw as Record<string, unknown> | null ?? {}),
    // Remap Deliveroo-specific keys to shared transform keys
    postal_code:
      (addrRaw as Record<string, unknown> | null)?.postcode ??
      (addrRaw as Record<string, unknown> | null)?.postal_code,
    country_code:
      (addrRaw as Record<string, unknown> | null)?.country_code ??
      (addrRaw as Record<string, unknown> | null)?.country,
  }

  const totalAmount =
    raw.partner_fee_fractional != null ? raw.partner_fee_fractional : undefined
  const currency =
    typeof raw.currency === 'string' && raw.currency.length === 3
      ? (raw.currency as string)
      : undefined

  return {
    id: orderId,
    status: mapStatus(raw.status),
    warehouseId: raw.restaurant_id ?? undefined,
    customerId: raw.customer_id ?? undefined,
    destinationAddress: toAddress(Object.keys(destRaw).length ? destRaw : null),
    currency: currency as Order['currency'],
    totalAmount,
    orderAt: toISODate(raw.prepare_for ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
