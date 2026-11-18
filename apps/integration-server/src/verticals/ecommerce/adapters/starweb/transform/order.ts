/**
 * Starweb Order → canonical Order.
 *
 * Starweb orders have a single `statusId` that covers the combined order
 * state plus separate `paymentStatus` and `isComplete` flags. We map:
 *
 *   paymentStatus == 'paid' && !isComplete   → {PAID, UNFULFILLED}
 *   paymentStatus == 'paid' && isComplete     → {PAID, FULFILLED}
 *   paymentStatus == 'unpaid'                 → {PENDING, UNFULFILLED}
 *   (fallback)                                → no canonical status set
 *
 * Money fields are decimal major units (e.g. 199.00) — converted to
 * integer minor units via `majorToMinor`. Currency comes from
 * `currencyCode` on the order.
 *
 * Line items live under `items` (when `include=items` is used). Addresses
 * live under `addresses` sub-object.
 *
 * Docs: https://api-docs.starweb.se/
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import type { RawStarwebAddress } from './customer'

export interface RawStarwebOrderItem {
  itemId?: number | string
  sku?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  vatRate?: number | null
  discount?: number | null
  discountType?: string | null
  [key: string]: unknown
}

/**
 * OrderAddressModel (per the Starweb OpenAPI spec) — the address type keys
 * are `customerInvoice` and `customerDelivery` (these differ from the
 * customer address model which uses `invoice`/`delivery`).
 */
export interface RawStarwebOrderAddressData {
  originalInvoice?: RawStarwebAddress
  originalDelivery?: RawStarwebAddress
  customerInvoice?: RawStarwebAddress
  customerDelivery?: RawStarwebAddress
  paymentMethodInvoice?: RawStarwebAddress
  paymentMethodDelivery?: RawStarwebAddress
  [key: string]: unknown
}

export interface RawStarwebOrder {
  orderId: number | string
  createdAt?: string | null
  modifiedAt?: string | null
  currencyCode?: string | null
  baseCurrencyCode?: string | null
  totalAmount?: number | null
  totalVat?: number | null
  amountToPay?: number | null
  shippingCost?: number | null
  shippingVatRate?: number | null
  paymentFee?: number | null
  customerId?: number | string | null
  statusId?: number | null
  paymentMethodId?: number | null
  paymentMethodName?: string | null
  paymentReference?: string | null
  paymentStatus?: string | null // 'paid' | 'unpaid' | etc.
  isComplete?: boolean
  isRead?: boolean
  shippingMethodId?: number | null
  shippingMethodName?: string | null
  shippingTrackingNo?: string | null
  discountCode?: string | null
  internalComment?: string | null
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  items?: { data?: RawStarwebOrderItem[] }
  /** Nested include — wrapped in `{data: OrderAddressModel}` by the API. */
  addresses?: { data?: RawStarwebOrderAddressData }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | null | undefined): number {
  return v ?? 0
}

function mapAddress(raw: RawStarwebAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function mapStatuses(order: RawStarwebOrder): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  const payment = order.paymentStatus?.toLowerCase()
  const complete = order.isComplete === true

  if (payment === 'paid') {
    return {
      financialStatus: 'PAID',
      fulfillmentStatus: complete ? 'FULFILLED' : 'UNFULFILLED',
    }
  }
  if (payment === 'unpaid') {
    return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
  }
  return {}
}

function mapLineItem(raw: RawStarwebOrderItem, currency: string): LineItem {
  const qty = raw.quantity ?? 1
  const unitPrice = majorToMinor(toNum(raw.unitPrice), currency)
  return {
    id: String(raw.itemId ?? ''),
    title: raw.description ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawStarwebOrder): Order {
  const currency = raw.currencyCode ?? 'SEK'
  const money = (v: number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })

  const { financialStatus, fulfillmentStatus } = mapStatuses(raw)

  // addresses is wrapped in {data: OrderAddressModel}; access via .data.
  const addrData = raw.addresses?.data
  const billing = mapAddress(addrData?.customerInvoice)
  const shipping = mapAddress(addrData?.customerDelivery)

  // items is wrapped in {data: OrderItemModel[]}; access via .data.
  const itemList = raw.items?.data ?? []

  const discountCodes: string[] = []
  if (raw.discountCode) discountCodes.push(raw.discountCode)

  return {
    id: String(raw.orderId),
    orderNumber: String(raw.orderId),
    name: `#${raw.orderId}`,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    currency,
    totalTax: raw.totalVat != null ? money(raw.totalVat) : undefined,
    totalShipping: raw.shippingCost != null ? money(raw.shippingCost) : undefined,
    totalPrice: raw.totalAmount != null ? money(raw.totalAmount) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: itemList.map((li) => mapLineItem(li, currency)),
    billingAddress: billing,
    shippingAddress: shipping,
    discountCodes: discountCodes.length > 0 ? discountCodes : undefined,
    note: raw.internalComment ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Starweb order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    currencyCode: order.currency,
    discountCode: order.discountCodes?.[0],
    internalComment: order.note,
    customerId: order.customerId,
    items: order.lineItems?.map((li) => ({
      sku: li.sku,
      description: li.title,
      quantity: li.quantity,
      // Canonical price is integer minor units; Starweb expects decimal major units.
      // Use currency-aware divisor from minorToMajor (e.g. /100 for SEK/EUR, /1 for JPY).
      unitPrice: minorToMajor(li.price?.amount, li.price?.currency ?? order.currency),
    })),
  }
}
