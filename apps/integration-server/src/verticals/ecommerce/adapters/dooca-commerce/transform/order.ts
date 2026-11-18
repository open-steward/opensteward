/**
 * Dooca Commerce Order → canonical Order.
 *
 * Dooca order key fields:
 *   - `code` — human-facing order number
 *   - `status` — "open" | "canceled" | "archived"
 *   - `payment_status` — "pending" | "paid" | "voided" | "approved" | "denied" |
 *       "expired" | "refunded" | "chargeback"
 *   - `fulfillment_status` — "attended" | "invoiced" | "shipped" | "delivered"
 *   - `total`, `subtotal`, `discount`, `tax` — decimal major units (BRL)
 *   - `customer` — embedded customer object
 *   - `address` — Brazilian address (street, number, district, city, state, zipcode)
 *   - `items[]` — line items with `product_id`, `variation_id`, `name`, `price`,
 *       `total`, `quantity`, `sku`
 *   - `payment` — embedded payment object with `name`, `method`
 *   - `shipping` — embedded shipping with `name`, `price`
 *   - `canceled_at`, `created_at`, `updated_at`
 *
 * Docs: https://docs.dooca.com.br/pedido/api
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Dooca shapes ──────────────────────────────────────────────────────────

export interface RawDoocaOrderAddress {
  receiver?: string | null
  zipcode?: string | null
  street?: string | null
  number?: string | null
  detail?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  [key: string]: unknown
}

export interface RawDoocaOrderLineItem {
  id: number | string
  order_id?: number | string | null
  product_id?: number | string | null
  variation_id?: number | string | null
  name: string
  reference?: string | null   // SKU
  sku?: string | null
  price?: string | number
  total?: string | number
  quantity: number
  discount?: string | number
  [key: string]: unknown
}

export interface RawDoocaOrderPayment {
  name?: string | null
  method?: string | null
  parcels?: number
  parcel_price?: string | number
  [key: string]: unknown
}

export interface RawDoocaOrderShipping {
  name?: string | null
  price?: string | number
  [key: string]: unknown
}

export interface RawDoocaOrderCustomer {
  id?: number | string
  email?: string | null
  name?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawDoocaOrder {
  id: number | string
  code?: string | number | null
  type?: string
  status?: string | null           // open | canceled | archived
  payment_status?: string | null   // pending | paid | voided | approved | denied | expired | refunded | chargeback
  fulfillment_status?: string | null // attended | invoiced | shipped | delivered
  total?: string | number | null
  subtotal?: string | number | null
  discount?: string | number | null
  tax?: string | number | null
  shipping?: RawDoocaOrderShipping | null
  customer?: RawDoocaOrderCustomer | null
  customer_id?: number | string | null
  address?: RawDoocaOrderAddress | null
  items?: RawDoocaOrderLineItem[]
  payment?: RawDoocaOrderPayment | null
  discount_coupon?: string | null
  note?: string | null
  canceled_at?: string | null
  archived_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY = 'BRL'

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined): number {
  return majorToMinor(toNum(v), CURRENCY)
}

function money(v: string | number | null | undefined) {
  return { amount: toMinor(v), currency: CURRENCY }
}

// Map Dooca payment_status to canonical OrderFinancialStatus
const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  approved: 'AUTHORIZED',
  paid: 'PAID',
  denied: 'VOIDED',
  voided: 'VOIDED',
  expired: 'VOIDED',
  refunded: 'REFUNDED',
  chargeback: 'REFUNDED',
}

// Map Dooca fulfillment_status to canonical OrderFulfillmentStatus
const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  attended: 'UNFULFILLED',
  invoiced: 'PARTIAL',
  shipped: 'PARTIAL',
  delivered: 'FULFILLED',
}

function mapAddress(raw: RawDoocaOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const number = raw.number ?? undefined
  const line1 = street && number ? `${street}, ${number}` : (street ?? undefined)
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  if (!line1 && !city && !postalCode) return undefined
  return {
    line1,
    line2: raw.detail ?? raw.district ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country: 'BR',
  }
}

function mapLineItem(raw: RawDoocaOrderLineItem): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variation_id != null ? String(raw.variation_id) : undefined,
    title: raw.name,
    quantity: raw.quantity,
    price: money(raw.price),
    totalDiscount:
      raw.discount != null && toNum(raw.discount) > 0
        ? money(raw.discount)
        : undefined,
    sku: raw.sku ?? raw.reference ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawDoocaOrder): Order {
  const shippingPrice = raw.shipping?.price

  const customerId =
    raw.customer?.id != null
      ? String(raw.customer.id)
      : raw.customer_id != null
        ? String(raw.customer_id)
        : undefined

  return {
    id: String(raw.id),
    orderNumber: raw.code != null ? String(raw.code) : undefined,
    name: raw.code != null ? `#${raw.code}` : undefined,
    customerId,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? undefined,
    currency: CURRENCY,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.tax != null ? money(raw.tax) : undefined,
    totalDiscounts: raw.discount != null ? money(raw.discount) : undefined,
    totalShipping: shippingPrice != null ? money(shippingPrice) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus: raw.payment_status
      ? PAYMENT_STATUS_MAP[raw.payment_status] ?? undefined
      : undefined,
    fulfillmentStatus: raw.fulfillment_status
      ? FULFILLMENT_STATUS_MAP[raw.fulfillment_status] ?? undefined
      : undefined,
    lineItems: (raw.items ?? []).map(mapLineItem),
    shippingAddress: mapAddress(raw.address),
    discountCodes: raw.discount_coupon ? [raw.discount_coupon] : undefined,
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    cancelledAt: toIsoDatetime(raw.canceled_at) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Dooca order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    note: order.note,
  }
  if (order.customerId) body['customer_id'] = order.customerId
  if (order.lineItems && order.lineItems.length > 0) {
    body['items'] = order.lineItems.map((li) => ({
      name: li.title,
      variation: li.variantId,
      quantity: li.quantity,
      price: li.price?.amount != null ? (li.price.amount / 100).toFixed(2) : undefined,
      sku: li.sku,
    }))
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress
    const parts = (a.line1 ?? '').split(',')
    body['address'] = {
      street: parts[0]?.trim(),
      number: parts[1]?.trim(),
      detail: a.line2,
      city: a.city,
      state: a.region,
      zipcode: a.postalCode,
    }
  }
  return body
}
