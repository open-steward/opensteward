import type { Order } from '../../../schema/order'
import { toISODate, parseDecimal } from '../../shared/transform'
import { transformAddress, type ShipcloudAddress } from './address'

/**
 * A line item within a shipcloud order.
 * title and item_info support localised objects; we extract the "en" or
 * "default" locale, falling back to a raw string if the API returns one.
 */
export interface ShipcloudOrderLineItem {
  id?: string | null
  sku?: string | null
  title?: { de?: string | null; en?: string | null; default?: string | null } | string | null
  quantity?: number | null
  price?: number | null
  vat?: number | null
  currency?: string | null
  weight?: number | null
  weight_unit?: string | null
  item_info?: unknown[] | null
  [key: string]: unknown
}

/**
 * Top-level shipcloud order response object.
 * GET /v1/orders and GET /v1/orders/:id
 */
export interface ShipcloudOrder {
  id: string
  placed_at?: string | null
  refundable_until?: string | null
  external_order_id?: string | null
  external_customer_id?: string | null
  total_price?: number | null
  total_vat?: number | null
  currency?: string | null
  total_weight?: number | null
  weight_unit?: string | null
  delivery_address?: ShipcloudAddress | null
  order_line_items?: ShipcloudOrderLineItem[] | null
  [key: string]: unknown
}

/**
 * Extract a localised string from a shipcloud title object.
 * Prefers English, falls back to 'default', then DE, then a raw string.
 */
function localised(
  val: { de?: string | null; en?: string | null; default?: string | null } | string | null | undefined,
): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val || undefined
  return val.en ?? val.default ?? val.de ?? undefined
}

export function transformOrder(raw: ShipcloudOrder): Order {
  const lineItems = (raw.order_line_items ?? []).map((item) => ({
    id: item.id ?? undefined,
    sku: item.sku ?? undefined,
    name: localised(item.title),
    quantity: item.quantity ?? undefined,
    unitAmount: item.price != null ? (parseDecimal(item.price) ?? 0) : undefined,
  }))

  return {
    id: raw.id,
    // shipcloud orders have no explicit status field — mark as PENDING since
    // the order model at this layer is informational (used for returns portal)
    status: 'PENDING',
    orderNumber: raw.external_order_id ?? undefined,
    customerId: raw.external_customer_id ?? undefined,
    destinationAddress: raw.delivery_address
      ? transformAddress(raw.delivery_address)
      : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount:
      raw.total_price != null ? (parseDecimal(raw.total_price) ?? 0) : undefined,
    taxAmount:
      raw.total_vat != null ? (parseDecimal(raw.total_vat) ?? 0) : undefined,
    orderAt: toISODate(raw.placed_at),
    metadata: raw as Record<string, unknown>,
  }
}
