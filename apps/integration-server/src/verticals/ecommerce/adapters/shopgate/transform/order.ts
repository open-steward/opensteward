/**
 * Shopgate Order → canonical Order.
 *
 * Shopgate models an order as a "sales order" on the Order Service. Notable
 * characteristics:
 *  - Identified by `orderNumber` (string).
 *  - Money amounts are decimal major-unit values — converted to minor units.
 *  - `addressSequences` is a list of address objects (billing = index 0,
 *    shipping = index 1 by convention).
 *  - `paymentStatus` / `fulfillmentStatus` map to the canonical enums.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateAddress {
  firstName?: string | null
  lastName?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  countryCode?: string | null
  country?: string | null
  phone?: string | null
}

export interface RawShopgateLineItem {
  id?: string | null
  productCode?: string | null
  variantCode?: string | null
  catalogCode?: string | null
  name?: string
  quantity: number
  unitPrice?: string | number | null
  currency?: string
  sku?: string | null
  extendedPrice?: string | number | null
}

export interface RawShopgateOrder {
  orderNumber: string
  externalOrderNumber?: string | null
  customerId?: string | null
  localeCode?: string
  currencyCode?: string
  status?: string | null
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  subTotal?: string | number | null
  taxAmount?: string | number | null
  shippingAmount?: string | number | null
  total?: string | number | null
  discountAmount?: string | number | null
  lineItems?: RawShopgateLineItem[]
  primaryBillToAddressSequenceIndex?: number
  primaryShipToAddressSequenceIndex?: number
  addressSequences?: RawShopgateAddress[]
  notes?: string | null
  tags?: string[]
  submitDate?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function money(v: string | number | null | undefined, currency: string) {
  return v != null ? { amount: toMinor(v, currency), currency } : undefined
}

function mapAddress(raw: RawShopgateAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  paid: 'PAID',
  partially_paid: 'PARTIALLY_PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  partial: 'PARTIAL',
  fulfilled: 'FULFILLED',
  in_progress: 'PARTIAL',
}

function mapLineItem(raw: RawShopgateLineItem, currency: string): LineItem {
  return {
    id: raw.id ?? `${raw.productCode ?? ''}:${raw.variantCode ?? ''}`,
    productId: raw.productCode ?? undefined,
    variantId: raw.variantCode ?? undefined,
    title: raw.name ?? raw.productCode ?? '',
    quantity: raw.quantity,
    price: { amount: toMinor(raw.unitPrice, raw.currency ?? currency), currency: raw.currency ?? currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawShopgateOrder): Order {
  const currency = raw.currencyCode ?? 'USD'
  const addrs = raw.addressSequences ?? []
  const billIdx = raw.primaryBillToAddressSequenceIndex ?? 0
  const shipIdx = raw.primaryShipToAddressSequenceIndex ?? 1

  const finStatus = raw.paymentStatus
    ? FIN_STATUS_MAP[raw.paymentStatus.toLowerCase()]
    : undefined
  const fulStatus = raw.fulfillmentStatus
    ? FUL_STATUS_MAP[raw.fulfillmentStatus.toLowerCase()]
    : undefined

  return {
    id: raw.orderNumber,
    orderNumber: raw.orderNumber,
    name: raw.externalOrderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    currency,
    subtotalPrice: money(raw.subTotal, currency),
    totalTax: money(raw.taxAmount, currency),
    totalShipping: money(raw.shippingAmount, currency),
    totalDiscounts: money(raw.discountAmount, currency),
    totalPrice: money(raw.total, currency),
    financialStatus: finStatus,
    fulfillmentStatus: fulStatus,
    lineItems: (raw.lineItems ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(addrs[billIdx]),
    shippingAddress: mapAddress(addrs[shipIdx] ?? addrs[billIdx]),
    note: raw.notes ?? undefined,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : undefined,
    createdAt: raw.createdAt ?? raw.submitDate ?? undefined,
    updatedAt: raw.updatedAt,
    processedAt: raw.submitDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Shopgate order body (create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const addressSequences: RawShopgateAddress[] = []
  if (order.billingAddress) {
    const a = order.billingAddress
    addressSequences.push({
      street1: a.line1,
      street2: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      countryCode: a.country,
    })
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress
    addressSequences.push({
      street1: a.line1,
      street2: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      countryCode: a.country,
    })
  }

  return {
    currencyCode: order.currency,
    customerId: order.customerId,
    notes: order.note,
    tags: order.tags,
    addressSequences: addressSequences.length > 0 ? addressSequences : undefined,
    primaryBillToAddressSequenceIndex: order.billingAddress ? 0 : undefined,
    primaryShipToAddressSequenceIndex: order.shippingAddress ? 1 : undefined,
    lineItems: order.lineItems?.map((li) => ({
      productCode: li.productId,
      variantCode: li.variantId,
      name: li.title,
      quantity: li.quantity,
      unitPrice: li.price != null ? minorToMajor(li.price.amount, li.price.currency) : undefined,
      currency: li.price?.currency,
      sku: li.sku,
    })),
  }
}
