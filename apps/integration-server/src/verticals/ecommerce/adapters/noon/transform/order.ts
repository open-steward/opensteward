/**
 * Noon Order -> canonical Order.
 *
 * Noon's `/seller/orders` returns order envelopes with nested line items.
 *
 * Order status mapping:
 *   pending        -> PENDING / UNFULFILLED
 *   confirmed      -> PAID / UNFULFILLED
 *   processing     -> PAID / PARTIAL
 *   shipped        -> PAID / PARTIAL
 *   delivered      -> PAID / FULFILLED
 *   returned       -> REFUNDED / RESTOCKED
 *   cancelled      -> VOIDED / UNFULFILLED
 *   failed         -> VOIDED / UNFULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'

// -- Raw shapes ---------------------------------------------------------------

export interface RawNoonOrderItem {
  order_item_id?: string | number
  sku?: string
  seller_sku?: string
  title?: string
  title_ar?: string
  unit_price?: number | string
  quantity?: number
  tax_amount?: number | string
  discount_amount?: number | string
  status?: string
  product_id?: string | number
  [key: string]: unknown
}

export interface RawNoonOrder {
  order_id?: string | number
  order_number?: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  created_at?: string
  updated_at?: string
  status?: string
  total_amount?: number | string
  subtotal?: number | string
  shipping_fee?: number | string
  tax_total?: number | string
  discount_total?: number | string
  payment_method?: string
  currency?: string
  items?: RawNoonOrderItem[]
  shipping_address?: {
    name?: string
    line1?: string
    line2?: string
    city?: string
    region?: string
    postal_code?: string
    country?: string
    phone?: string
    [key: string]: unknown
  }
  billing_address?: {
    name?: string
    line1?: string
    line2?: string
    city?: string
    region?: string
    postal_code?: string
    country?: string
    phone?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// -- Helpers ------------------------------------------------------------------

function parseNumber(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Map Noon order status to canonical financial status.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'confirmed':
    case 'processing':
    case 'shipped':
    case 'delivered':
      return 'PAID'
    case 'returned':
      return 'REFUNDED'
    case 'cancelled':
    case 'failed':
      return 'VOIDED'
    default:
      return undefined
  }
}

/**
 * Map Noon order status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'pending':
    case 'confirmed':
    case 'cancelled':
    case 'failed':
      return 'UNFULFILLED'
    case 'processing':
    case 'shipped':
      return 'PARTIAL'
    case 'delivered':
      return 'FULFILLED'
    case 'returned':
      return 'RESTOCKED'
    default:
      return undefined
  }
}

function mapAddress(
  raw: RawNoonOrder['shipping_address'],
): { line1?: string; line2?: string; city?: string; region?: string; postalCode?: string; country?: string } | undefined {
  if (!raw) return undefined
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.region,
    postalCode: raw.postal_code,
    country: raw.country,
  }
}

function mapLineItem(raw: RawNoonOrderItem, currency: string): LineItem {
  const unitPrice = parseNumber(raw.unit_price)
  const qty = raw.quantity ?? 1
  return {
    id: String(raw.order_item_id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    title: raw.title ?? raw.title_ar ?? raw.sku ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.seller_sku ?? raw.sku ?? undefined,
    totalDiscount:
      raw.discount_amount ? { amount: parseNumber(raw.discount_amount), currency } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// -- Transform ----------------------------------------------------------------

export function transformOrder(raw: RawNoonOrder, currency = 'AED'): Order {
  const orderCurrency = raw.currency ?? currency
  const lineItems = (raw.items ?? []).map((li) => mapLineItem(li, orderCurrency))
  const isCancelled = raw.status?.toLowerCase() === 'cancelled'

  return {
    id: String(raw.order_id ?? ''),
    orderNumber: raw.order_number ?? String(raw.order_id ?? ''),
    name: raw.order_number ?? undefined,
    email: raw.customer_email ?? undefined,
    phone: raw.customer_phone ?? undefined,
    currency: orderCurrency,
    subtotalPrice:
      raw.subtotal != null ? { amount: parseNumber(raw.subtotal), currency: orderCurrency } : undefined,
    totalTax:
      raw.tax_total != null ? { amount: parseNumber(raw.tax_total), currency: orderCurrency } : undefined,
    totalPrice:
      raw.total_amount != null
        ? { amount: parseNumber(raw.total_amount), currency: orderCurrency }
        : undefined,
    totalShipping:
      raw.shipping_fee != null
        ? { amount: parseNumber(raw.shipping_fee), currency: orderCurrency }
        : undefined,
    totalDiscounts:
      raw.discount_total != null
        ? { amount: parseNumber(raw.discount_total), currency: orderCurrency }
        : undefined,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.shipping_address),
    billingAddress: mapAddress(raw.billing_address),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    cancelledAt: isCancelled ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
