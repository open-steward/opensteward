/**
 * Petpooja order → canonical Order.
 *
 * Petpooja represents orders placed through online ordering channels. Third-party
 * platforms push orders INTO Petpooja via `saveOrder`; the adapter can also read
 * back order status. Order amounts are in INR (major-unit decimal strings).
 *
 * Key Petpooja order fields:
 *   orderid, order_number, client_order_id, order_date, order_time,
 *   customer_name, customer_number, customer_address, total_amount,
 *   discount_amount, tax_amount, delivery_charges, payment_status,
 *   order_status, items (array of ordered items)
 *
 * order_status values: 1=placed, 2=accepted, 3=ready, 4=dispatched,
 *   5=delivered, 6=cancelled
 *
 * payment_status values: 0=pending, 1=paid
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Petpooja shapes ───────────────────────────────────────────────────────

export interface RawPetpoojaOrderItem {
  itemid: number | string
  item_name: string
  quantity: number | string
  price: string | number
  variant_id?: number | string | null
  [key: string]: unknown
}

export interface RawPetpoojaOrder {
  orderid?: number | string
  order_number?: number | string
  client_order_id?: string | null
  order_date?: string | null
  order_time?: string | null
  customer_name?: string | null
  customer_number?: string | null
  customer_email?: string | null
  customer_address?: string | null
  customer_city?: string | null
  customer_pincode?: string | null
  total_amount?: string | number | null
  discount_amount?: string | number | null
  tax_amount?: string | number | null
  delivery_charges?: string | number | null
  /** 0 = pending/COD, 1 = paid online */
  payment_status?: number | string | null
  /** 1=placed, 2=accepted, 3=ready, 4=dispatched, 5=delivered, 6=cancelled */
  order_status?: number | string | null
  items?: RawPetpoojaOrderItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY = 'INR'

function toMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, CURRENCY)
}

function toInt(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseInt(v, 10) : Math.round(v)
}

function mapFinancialStatus(
  status: number | string | null | undefined,
): OrderFinancialStatus | undefined {
  const n = toInt(status)
  if (n === 1) return 'PAID'
  if (n === 0) return 'PENDING'
  return undefined
}

function mapFulfillmentStatus(
  status: number | string | null | undefined,
): OrderFulfillmentStatus | undefined {
  const n = toInt(status)
  // 1=placed→UNFULFILLED, 2=accepted→UNFULFILLED, 3=ready→PARTIAL,
  // 4=dispatched→PARTIAL, 5=delivered→FULFILLED, 6=cancelled→RESTOCKED
  if (n === 1 || n === 2) return 'UNFULFILLED'
  if (n === 3 || n === 4) return 'PARTIAL'
  if (n === 5) return 'FULFILLED'
  if (n === 6) return 'RESTOCKED'
  return undefined
}

function mapAddress(
  addressStr: string | null | undefined,
  city: string | null | undefined,
  pincode: string | null | undefined,
): Address | undefined {
  if (!addressStr && !city && !pincode) return undefined
  return {
    line1: addressStr ?? undefined,
    city: city ?? undefined,
    postalCode: pincode ?? undefined,
    country: 'IN',
  }
}

/** Build ISO-8601 datetime from separate date + time strings. */
function buildDatetime(
  date: string | null | undefined,
  time: string | null | undefined,
): string | undefined {
  if (!date) return undefined
  // date may be "YYYY-MM-DD", time may be "HH:MM:SS" or "HH:MM"
  const d = date.trim()
  const t = time ? time.trim() : '00:00:00'
  // Produce a UTC-ish ISO string — Petpooja docs don't specify timezone,
  // so we treat the value as local time and append 'Z' for determinism.
  try {
    return new Date(`${d}T${t}Z`).toISOString()
  } catch {
    return undefined
  }
}

function mapLineItem(raw: RawPetpoojaOrderItem): LineItem {
  const qty = typeof raw.quantity === 'string' ? parseInt(raw.quantity, 10) : raw.quantity
  return {
    id: String(raw.itemid),
    productId: String(raw.itemid),
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.item_name,
    quantity: qty ?? 1,
    price: { amount: toMinor(raw.price), currency: CURRENCY },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawPetpoojaOrder): Order {
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v),
    currency: CURRENCY,
  })

  const orderId = raw.orderid ?? raw.client_order_id ?? raw.order_number
  const lineItems = (raw.items ?? []).map(mapLineItem)
  const createdAt = buildDatetime(raw.order_date, raw.order_time)

  // Compute subtotal from line items if total_amount not provided
  const totalPrice = raw.total_amount != null ? money(raw.total_amount) : undefined
  const totalTax = raw.tax_amount != null ? money(raw.tax_amount) : undefined
  const totalDiscounts = raw.discount_amount != null ? money(raw.discount_amount) : undefined
  const totalShipping = raw.delivery_charges != null ? money(raw.delivery_charges) : undefined

  return {
    id: String(orderId),
    orderNumber: raw.order_number != null ? String(raw.order_number) : undefined,
    name: raw.client_order_id ?? undefined,
    phone: raw.customer_number ?? undefined,
    email: raw.customer_email ?? undefined,
    currency: CURRENCY,
    totalPrice,
    totalTax,
    totalDiscounts,
    totalShipping,
    financialStatus: mapFinancialStatus(raw.payment_status),
    fulfillmentStatus: mapFulfillmentStatus(raw.order_status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(
      raw.customer_address,
      raw.customer_city,
      raw.customer_pincode,
    ),
    createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Petpooja saveOrder body. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    client_order_id: order.name ?? order.id,
    customer_name:
      order.email ??
      ([order.billingAddress?.line1, order.shippingAddress?.line1]
        .filter(Boolean)
        .join(' ') || undefined),
    customer_number: order.phone,
    customer_email: order.email,
  }

  if (order.shippingAddress) {
    const a = order.shippingAddress
    body['customer_address'] = a.line1
    body['customer_city'] = a.city
    body['customer_pincode'] = a.postalCode
  }

  if (order.totalPrice) {
    body['total_amount'] = (
      minorToMajor(order.totalPrice.amount, order.totalPrice.currency ?? CURRENCY) ?? 0
    ).toFixed(2)
  }
  if (order.totalTax) {
    body['tax_amount'] = (
      minorToMajor(order.totalTax.amount, order.totalTax.currency ?? CURRENCY) ?? 0
    ).toFixed(2)
  }
  if (order.totalDiscounts) {
    body['discount_amount'] = (
      minorToMajor(order.totalDiscounts.amount, order.totalDiscounts.currency ?? CURRENCY) ?? 0
    ).toFixed(2)
  }
  if (order.totalShipping) {
    body['delivery_charges'] = (
      minorToMajor(order.totalShipping.amount, order.totalShipping.currency ?? CURRENCY) ?? 0
    ).toFixed(2)
  }

  if (order.lineItems) {
    body['items'] = order.lineItems.map((li) => ({
      itemid: li.productId ?? li.id,
      item_name: li.title,
      quantity: li.quantity,
      price:
        li.price?.amount != null
          ? (minorToMajor(li.price.amount, li.price.currency ?? CURRENCY) ?? 0).toFixed(2)
          : '0.00',
      variant_id: li.variantId ?? null,
    }))
  }

  return body
}
