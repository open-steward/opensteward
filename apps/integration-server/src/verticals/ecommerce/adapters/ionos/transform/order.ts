/**
 * IONOS Order → canonical Order.
 *
 * IONOS orders carry buyer info, line items, shipping/billing addresses,
 * totals, and a combined status field. We split the status into the
 * canonical financial + fulfillment status pair.
 *
 * Common IONOS order statuses:
 *   pending / open → PENDING / UNFULFILLED
 *   paid / payment_complete → PAID / UNFULFILLED
 *   shipped / fulfilled → PAID / FULFILLED
 *   partially_shipped / partial → PARTIALLY_PAID / PARTIAL
 *   cancelled / canceled → VOIDED / UNFULFILLED
 *   refunded / returned → REFUNDED / UNFULFILLED
 *
 * Docs: https://developer.hosting.ionos.com/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw IONOS shapes ──────────────────────────────────────────────────────────

export interface RawIonosAddress {
  street?: string | null
  street2?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  region?: string | null
  postalCode?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
  [key: string]: unknown
}

export interface RawIonosTaxLine {
  name?: string
  rate?: number
  amount?: number | string | null
  [key: string]: unknown
}

export interface RawIonosLineItem {
  id?: string | number
  productId?: string | number
  variantId?: string | number
  name?: string
  title?: string
  sku?: string
  quantity?: number
  price?: number | string | null
  unitPrice?: number | string | null
  total?: number | string | null
  totalDiscount?: number | string | null
  taxLines?: RawIonosTaxLine[]
  fulfillmentStatus?: string
  [key: string]: unknown
}

export interface RawIonosOrder {
  id: string | number
  orderNumber?: string | number
  name?: string
  customerId?: string | number
  email?: string | null
  phone?: string | null
  currency?: string
  status?: string
  paymentStatus?: string
  fulfillmentStatus?: string
  subtotal?: number | string | null
  totalTax?: number | string | null
  totalDiscounts?: number | string | null
  totalShipping?: number | string | null
  total?: number | string | null
  totalPrice?: number | string | null
  lineItems?: RawIonosLineItem[]
  items?: RawIonosLineItem[]
  billingAddress?: RawIonosAddress | null
  shippingAddress?: RawIonosAddress | null
  discountCodes?: string[]
  tags?: string[]
  note?: string | null
  createdAt?: string
  updatedAt?: string
  processedAt?: string
  cancelledAt?: string
  cancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawIonosAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? raw.street ?? undefined
  const line2 = raw.addressLine2 ?? raw.street2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? raw.state ?? undefined
  const postalCode = raw.postalCode ?? raw.zip ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2,
    city,
    region,
    postalCode,
    country,
  }
}

function mapFinancialStatus(
  status: string | undefined,
  paymentStatus: string | undefined,
): OrderFinancialStatus | undefined {
  const s = (paymentStatus ?? status ?? '').toLowerCase()
  switch (s) {
    case 'pending':
    case 'open':
    case 'awaiting_payment':
      return 'PENDING'
    case 'authorized':
      return 'AUTHORIZED'
    case 'partially_paid':
    case 'partially_shipped':
      return 'PARTIALLY_PAID'
    case 'paid':
    case 'payment_complete':
    case 'completed':
    case 'shipped':
    case 'fulfilled':
      return 'PAID'
    case 'partially_refunded':
      return 'PARTIALLY_REFUNDED'
    case 'refunded':
    case 'returned':
      return 'REFUNDED'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'VOIDED'
    default:
      return undefined
  }
}

function mapFulfillmentStatus(
  status: string | undefined,
  fulfillmentStatus: string | undefined,
): OrderFulfillmentStatus | undefined {
  const s = (fulfillmentStatus ?? status ?? '').toLowerCase()
  switch (s) {
    case 'unfulfilled':
    case 'pending':
    case 'open':
    case 'awaiting_payment':
    case 'authorized':
    case 'paid':
    case 'payment_complete':
    case 'cancelled':
    case 'canceled':
    case 'voided':
    case 'refunded':
      return 'UNFULFILLED'
    case 'partial':
    case 'partially_shipped':
      return 'PARTIAL'
    case 'fulfilled':
    case 'shipped':
    case 'completed':
      return 'FULFILLED'
    case 'restocked':
    case 'returned':
      return 'RESTOCKED'
    default:
      return undefined
  }
}

function mapLineItemFulfillmentStatus(
  s: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!s) return undefined
  switch (s.toLowerCase()) {
    case 'fulfilled':
    case 'shipped':
      return 'FULFILLED'
    case 'partial':
      return 'PARTIAL'
    case 'unfulfilled':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function mapLineItem(raw: RawIonosLineItem, currency: string): LineItem {
  const unitPrice = toNum(raw.unitPrice ?? raw.price)
  return {
    id: raw.id != null ? String(raw.id) : '0',
    productId: raw.productId != null ? String(raw.productId) : undefined,
    variantId: raw.variantId != null ? String(raw.variantId) : undefined,
    title: raw.name ?? raw.title ?? '',
    quantity: raw.quantity ?? 1,
    sku: raw.sku ?? undefined,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    totalDiscount:
      raw.totalDiscount != null
        ? { amount: majorToMinor(toNum(raw.totalDiscount), currency), currency }
        : undefined,
    taxLines:
      raw.taxLines && raw.taxLines.length > 0
        ? raw.taxLines.map((tl) => ({
            title: tl.name ?? 'Tax',
            rate: tl.rate ?? 0,
            amount: { amount: majorToMinor(toNum(tl.amount), currency), currency },
          }))
        : undefined,
    fulfillmentStatus: mapLineItemFulfillmentStatus(raw.fulfillmentStatus),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawIonosOrder): Order {
  const currency = raw.currency ?? 'EUR'
  const money = (v: number | string | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })

  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) =>
    mapLineItem(li, currency),
  )

  const orderNumber =
    raw.orderNumber != null ? String(raw.orderNumber) : undefined

  const financialStatus = mapFinancialStatus(raw.status, raw.paymentStatus)
  const fulfillmentStatus = mapFulfillmentStatus(raw.status, raw.fulfillmentStatus)

  return {
    id: String(raw.id),
    orderNumber,
    name: raw.name ?? (orderNumber != null ? `#${orderNumber}` : undefined),
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.totalTax != null ? money(raw.totalTax) : undefined,
    totalDiscounts: raw.totalDiscounts != null ? money(raw.totalDiscounts) : undefined,
    totalShipping: raw.totalShipping != null ? money(raw.totalShipping) : undefined,
    totalPrice: raw.totalPrice != null ? money(raw.totalPrice) : raw.total != null ? money(raw.total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : [],
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    discountCodes:
      raw.discountCodes && raw.discountCodes.length > 0
        ? raw.discountCodes
        : undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    note: raw.note ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    processedAt: raw.processedAt ?? undefined,
    cancelledAt: raw.cancelledAt ?? undefined,
    cancelReason: raw.cancelReason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
