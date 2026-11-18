/**
 * Ecwid Order → canonical Order.
 *
 * Ecwid has separate `paymentStatus` and `fulfillmentStatus` fields.
 *
 *   paymentStatus mapping:
 *     AWAITING_PAYMENT → PENDING
 *     PAID             → PAID
 *     CANCELLED        → VOIDED
 *     REFUNDED         → REFUNDED
 *     PARTIALLY_REFUNDED → PARTIALLY_REFUNDED
 *     INCOMPLETE       → PENDING
 *
 *   fulfillmentStatus mapping:
 *     AWAITING_PROCESSING → UNFULFILLED
 *     PROCESSING          → UNFULFILLED
 *     SHIPPED             → FULFILLED
 *     DELIVERED           → FULFILLED
 *     WILL_NOT_DELIVER    → UNFULFILLED
 *     RETURNED            → RESTOCKED
 *     READY_FOR_PICKUP    → PARTIAL
 *
 * Docs: https://developer.ecwid.com/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Ecwid shapes ───────────────────────────────────────────────────────

export interface RawEcwidOrderAddress {
  name?: string | null
  companyName?: string | null
  street?: string | null
  city?: string | null
  countryCode?: string | null
  countryName?: string | null
  postalCode?: string | null
  stateOrProvinceCode?: string | null
  stateOrProvinceName?: string | null
  phone?: string | null
}

export interface RawEcwidOrderItem {
  id?: number | string
  productId?: number | string
  name: string
  quantity: number
  price?: number
  productPrice?: number
  sku?: string | null
  tax?: number
  shipping?: number
  discount?: number
  couponAmount?: number
  selectedOptions?: Array<{ name: string; value: string }>
  [key: string]: unknown
}

export interface RawEcwidOrder {
  id?: number | string
  orderNumber?: number | string
  vendorOrderNumber?: string
  customerId?: number | string
  email?: string | null
  paymentStatus?: string
  fulfillmentStatus?: string
  subtotal?: number
  total?: number
  tax?: number
  couponDiscount?: number
  discount?: number
  shippingOption?: { shippingRate?: number }
  handlingFee?: { value?: number }
  items?: RawEcwidOrderItem[]
  billingPerson?: RawEcwidOrderAddress | null
  shippingPerson?: RawEcwidOrderAddress | null
  paymentMethod?: string
  createDate?: string
  updateDate?: string
  createTimestamp?: number
  updateTimestamp?: number
  orderComments?: string | null
  privateAdminNotes?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawEcwidOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.stateOrProvinceCode ?? raw.stateOrProvinceName ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? raw.countryName ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'AWAITING_PAYMENT':
    case 'INCOMPLETE':
      return 'PENDING'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    case 'REFUNDED':
      return 'REFUNDED'
    case 'PARTIALLY_REFUNDED':
      return 'PARTIALLY_REFUNDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'AWAITING_PROCESSING':
    case 'PROCESSING':
    case 'WILL_NOT_DELIVER':
      return 'UNFULFILLED'
    case 'SHIPPED':
    case 'DELIVERED':
      return 'FULFILLED'
    case 'RETURNED':
      return 'RESTOCKED'
    case 'READY_FOR_PICKUP':
      return 'PARTIAL'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawEcwidOrderItem, currency: string): LineItem {
  const unitPrice = raw.price ?? raw.productPrice ?? 0
  return {
    id: raw.id != null ? String(raw.id) : String(raw.productId ?? '0'),
    productId: raw.productId != null ? String(raw.productId) : undefined,
    title: raw.name,
    quantity: raw.quantity,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    totalDiscount:
      raw.discount != null && raw.discount > 0
        ? { amount: majorToMinor(raw.discount, currency), currency }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function timestampToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformOrder(raw: RawEcwidOrder): Order {
  const currency = 'USD'
  const money = (v: number | null | undefined) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined

  const orderId = String(raw.id ?? raw.orderNumber ?? '')
  const orderNum = raw.orderNumber != null ? String(raw.orderNumber) : undefined

  const shippingTotal =
    raw.shippingOption?.shippingRate ??
    (raw.handlingFee?.value != null ? raw.handlingFee.value : undefined)

  const totalDiscount =
    raw.couponDiscount != null || raw.discount != null
      ? (raw.couponDiscount ?? 0) + (raw.discount ?? 0)
      : undefined

  return {
    id: orderId,
    orderNumber: orderNum,
    name: orderNum != null ? `#${orderNum}` : undefined,
    customerId:
      raw.customerId != null && raw.customerId !== 0
        ? String(raw.customerId)
        : undefined,
    email: raw.email ?? undefined,
    phone: raw.billingPerson?.phone ?? undefined,
    currency,
    subtotalPrice: money(raw.subtotal),
    totalTax: money(raw.tax),
    totalDiscounts:
      totalDiscount != null ? { amount: majorToMinor(totalDiscount, currency), currency } : undefined,
    totalShipping: money(shippingTotal),
    totalPrice: money(raw.total),
    financialStatus: mapFinancialStatus(raw.paymentStatus),
    fulfillmentStatus: mapFulfillmentStatus(raw.fulfillmentStatus),
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingPerson),
    shippingAddress: mapAddress(raw.shippingPerson),
    note: raw.orderComments ?? undefined,
    createdAt: raw.createDate ?? timestampToIso(raw.createTimestamp),
    updatedAt: raw.updateDate ?? timestampToIso(raw.updateTimestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Ecwid order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const billingPerson: Record<string, unknown> | undefined = order.billingAddress
    ? {
        street: order.billingAddress.line1,
        city: order.billingAddress.city,
        stateOrProvinceCode: order.billingAddress.region,
        postalCode: order.billingAddress.postalCode,
        countryCode: order.billingAddress.country,
        phone: order.phone,
      }
    : undefined

  const shippingPerson: Record<string, unknown> | undefined = order.shippingAddress
    ? {
        street: order.shippingAddress.line1,
        city: order.shippingAddress.city,
        stateOrProvinceCode: order.shippingAddress.region,
        postalCode: order.shippingAddress.postalCode,
        countryCode: order.shippingAddress.country,
      }
    : undefined

  return {
    email: order.email,
    customerId: order.customerId ? Number(order.customerId) : undefined,
    orderComments: order.note,
    billingPerson,
    shippingPerson,
    items: order.lineItems?.map((li) => ({
      productId: li.productId ? Number(li.productId) : undefined,
      quantity: li.quantity,
      name: li.title,
      price: li.price?.amount,
      sku: li.sku,
    })),
  }
}
