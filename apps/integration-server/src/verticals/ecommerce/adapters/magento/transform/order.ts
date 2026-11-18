/**
 * Magento Order → canonical Order.
 *
 * Magento has a single `status` string covering both financial and
 * fulfillment state. We split it into the canonical pair:
 *
 *   pending         → {PENDING, UNFULFILLED}
 *   pending_payment → {PENDING, UNFULFILLED}
 *   holded          → {PENDING, UNFULFILLED}
 *   processing      → {PAID,    UNFULFILLED}
 *   complete        → {PAID,    FULFILLED}
 *   canceled        → {VOIDED,  UNFULFILLED}
 *   closed          → {REFUNDED, UNFULFILLED}
 *
 * Line items live under `items`. Addresses come from `billing_address`
 * (on the order itself) and from
 * `extension_attributes.shipping_assignments[0].shipping.address`.
 * Money fields are numbers (not strings), and the order currency is on
 * `order_currency_code`.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Magento shapes ──────────────────────────────────────────────────────

export interface RawMagentoOrderAddress {
  address_type?: string
  city?: string
  country_id?: string
  email?: string
  entity_id?: number
  firstname?: string
  lastname?: string
  parent_id?: number
  postcode?: string
  region?: string
  region_code?: string
  street?: string[]
  telephone?: string
  [key: string]: unknown
}

export interface RawMagentoOrderItem {
  item_id: number
  parent_item_id?: number
  sku: string
  name: string
  product_id?: number
  product_type?: string
  price?: number
  qty_ordered?: number
  qty_shipped?: number
  qty_refunded?: number
  qty_canceled?: number
  qty_invoiced?: number
  row_total?: number
  row_total_incl_tax?: number
  discount_amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface RawMagentoShippingAssignment {
  shipping?: {
    address?: RawMagentoOrderAddress
    method?: string
  }
  items?: RawMagentoOrderItem[]
}

export interface RawMagentoOrderExtensionAttributes {
  shipping_assignments?: RawMagentoShippingAssignment[]
  payment_additional_info?: Array<{ key: string; value: string }>
}

export interface RawMagentoOrder {
  entity_id: number
  increment_id?: string
  status?: string
  state?: string
  customer_id?: number | null
  customer_email?: string
  customer_firstname?: string
  customer_lastname?: string
  order_currency_code?: string
  base_currency_code?: string
  grand_total?: number
  subtotal?: number
  tax_amount?: number
  discount_amount?: number
  shipping_amount?: number
  total_paid?: number | null
  total_refunded?: number | null
  items?: RawMagentoOrderItem[]
  billing_address?: RawMagentoOrderAddress
  payment?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  customer_note?: string | null
  coupon_code?: string | null
  extension_attributes?: RawMagentoOrderExtensionAttributes
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapAddress(raw: RawMagentoOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? []
  const line1 = street[0]
  const line2 = street.length > 1 ? street[1] : undefined
  const city = raw.city
  const region = raw.region ?? raw.region_code
  const postalCode = raw.postcode
  const country = raw.country_id
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status) {
    case 'pending':
    case 'pending_payment':
    case 'holded':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'processing':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'complete':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'canceled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'closed':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawMagentoOrderItem, currency: string): LineItem {
  return {
    id: String(raw.item_id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.name,
    quantity: raw.qty_ordered ?? 0,
    price: { amount: majorToMinor(raw.price ?? 0, currency), currency },
    totalDiscount:
      raw.discount_amount != null && raw.discount_amount > 0
        ? { amount: majorToMinor(raw.discount_amount, currency), currency }
        : undefined,
    sku: raw.sku,
    fulfillableQuantity:
      raw.qty_ordered != null
        ? raw.qty_ordered - (raw.qty_shipped ?? 0) - (raw.qty_canceled ?? 0)
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawMagentoOrder): Order {
  const currency = raw.order_currency_code ?? 'USD'
  const money = (v: number | undefined | null) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)

  // Filter out child simples (Magento duplicates configurable + child
  // as separate entries on the order `items` array, with the child
  // linked via `parent_item_id`). We keep parents; child rows stay
  // available via metadata for consumers who want them.
  const parentItems = (raw.items ?? []).filter((it) => it.parent_item_id == null)

  const shippingAssignment = raw.extension_attributes?.shipping_assignments?.[0]
  const shippingAddress = mapAddress(shippingAssignment?.shipping?.address)
  const billingAddress = mapAddress(raw.billing_address)

  return {
    id: String(raw.entity_id),
    orderNumber: raw.increment_id,
    name: raw.increment_id != null ? `#${raw.increment_id}` : undefined,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.customer_email ?? raw.billing_address?.email,
    phone: raw.billing_address?.telephone,
    currency,
    subtotalPrice: money(raw.subtotal),
    totalTax: money(raw.tax_amount),
    totalDiscounts:
      raw.discount_amount != null
        ? { amount: majorToMinor(Math.abs(raw.discount_amount), currency), currency }
        : undefined,
    totalShipping: money(raw.shipping_amount),
    totalPrice: money(raw.grand_total),
    financialStatus,
    fulfillmentStatus,
    lineItems: parentItems.map((li) => mapLineItem(li, currency)),
    billingAddress,
    shippingAddress,
    discountCodes: raw.coupon_code ? [raw.coupon_code] : undefined,
    note: raw.customer_note ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    cancelledAt: raw.status === 'canceled' ? raw.updated_at : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → Magento update body. Magento orders can not be
 * fully mutated over REST (direct POST /V1/orders is a no-op for
 * creation in practice); this untransform is used by the adapter's
 * minimal `updateOrder` path and keeps the shape stable for tests.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    entity: {
      entity_id: order.id != null ? Number(order.id) : undefined,
      increment_id: order.orderNumber,
      customer_email: order.email,
      customer_note: order.note,
      status: order.financialStatus,
    },
  }
}
