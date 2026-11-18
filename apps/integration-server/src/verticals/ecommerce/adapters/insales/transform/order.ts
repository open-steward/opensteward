/**
 * InSales Order → canonical Order.
 *
 * InSales order field names (JSON API):
 *   id, number, client_id, client { id, name, surname, email, phone },
 *   total_price, items_price, delivery_price, discount_price,
 *   financial_status (pending | approved | paid | declined | refunded),
 *   fulfillment_status (new | in_progress | delivered | cancelled),
 *   order_lines [{ id, product_id, variant_id, title, quantity, sale_price,
 *                  total_price, sku }],
 *   shipping_address { name, phone, address, city, state, zip, country },
 *   comment, delivery_title, discount_code, created_at, updated_at,
 *   accepted_at, delivered_at
 *
 * Prices are decimal major-unit RUB (or currency from the order). All money
 * values are converted to integer minor units.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawInsalesShippingAddress {
  name?: string | null
  phone?: string | null
  /** Full delivery address string */
  address?: string | null
  delivery_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  country_name?: string | null
  [key: string]: unknown
}

export interface RawInsalesOrderLine {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  title?: string
  quantity?: number
  /** Unit price (major units, e.g. 2999.00 RUB). */
  sale_price?: string | number
  /** Line total = sale_price × quantity. */
  total_price?: string | number
  sku?: string | null
  [key: string]: unknown
}

export interface RawInsalesClient {
  id?: number | string
  name?: string | null
  surname?: string | null
  email?: string | null
  phone?: string | null
}

export interface RawInsalesOrder {
  id: number | string
  number?: number | string
  client_id?: number | string | null
  client?: RawInsalesClient | null
  /** ISO 4217 currency code — defaults to RUB. */
  currency?: string | null
  total_price?: string | number
  items_price?: string | number
  delivery_price?: string | number
  discount_price?: string | number
  /** pending | approved | paid | declined | refunded */
  financial_status?: string | null
  /** new | in_progress | delivered | cancelled */
  fulfillment_status?: string | null
  order_lines?: RawInsalesOrderLine[]
  shipping_address?: RawInsalesShippingAddress | null
  comment?: string | null
  delivery_title?: string | null
  discount_code?: string | null
  created_at?: string
  updated_at?: string
  accepted_at?: string | null
  delivered_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function money(v: string | number | null | undefined, currency: string) {
  return { amount: toMinor(v, currency), currency }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  approved: 'AUTHORIZED',
  paid: 'PAID',
  declined: 'VOIDED',
  refunded: 'REFUNDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  new: 'UNFULFILLED',
  in_progress: 'PARTIAL',
  delivered: 'FULFILLED',
  cancelled: 'RESTOCKED',
}

function mapAddress(raw: RawInsalesShippingAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? raw.delivery_address ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? raw.country_name ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region: raw.state ?? undefined, postalCode, country }
}

function mapLineItem(raw: RawInsalesOrderLine, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.title ?? '',
    quantity: raw.quantity ?? 0,
    price: money(raw.sale_price, currency),
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawInsalesOrder): Order {
  const currency = raw.currency ?? 'RUB'
  const fin = raw.financial_status?.toLowerCase()
  const ful = raw.fulfillment_status?.toLowerCase()

  return {
    id: String(raw.id),
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId:
      raw.client_id != null
        ? String(raw.client_id)
        : raw.client?.id != null
        ? String(raw.client.id)
        : undefined,
    email: raw.client?.email ?? undefined,
    phone: raw.client?.phone ?? raw.shipping_address?.phone ?? undefined,
    currency,
    subtotalPrice: raw.items_price != null ? money(raw.items_price, currency) : undefined,
    totalShipping:
      raw.delivery_price != null ? money(raw.delivery_price, currency) : undefined,
    totalDiscounts:
      raw.discount_price != null ? money(raw.discount_price, currency) : undefined,
    totalPrice: raw.total_price != null ? money(raw.total_price, currency) : undefined,
    financialStatus: fin ? (FIN_STATUS_MAP[fin] ?? undefined) : undefined,
    fulfillmentStatus: ful ? (FUL_STATUS_MAP[ful] ?? undefined) : undefined,
    lineItems: (raw.order_lines ?? []).map((li) => mapLineItem(li, currency)),
    shippingAddress: mapAddress(raw.shipping_address),
    discountCodes: raw.discount_code ? [raw.discount_code] : undefined,
    note: raw.comment ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    processedAt: raw.accepted_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → InSales order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    comment: order.note,
  }
  if (order.lineItems) {
    body.order_lines_attributes = order.lineItems.map((li) => ({
      variant_id: li.variantId,
      quantity: li.quantity,
      sale_price: minorToMajor(li.price?.amount, li.price?.currency),
      title: li.title,
      sku: li.sku,
    }))
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress
    body.shipping_address_attributes = {
      address: a.line1,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      country: a.country,
    }
  }
  return body
}
