/**
 * Spryker orders → canonical Order.
 *
 * Spryker Glue REST API: GET /orders, GET /orders/{orderReference}
 *   Also: GET /customers/{id}/orders (customer-scoped)
 *
 * Response type: "orders", identified by orderReference (e.g. "DE--1").
 *
 * Key attribute fields:
 *   orderReference, createdAt, currencyIsoCode, priceMode, totals
 *   (expenseTotal, discountTotal, taxTotal, subtotal, grandTotal),
 *   billingAddress, shippingAddress (each with salutation, firstName,
 *   lastName, address1, address2, address3, zipCode, city, iso2Code, phone),
 *   items (array: sku, name, quantity, unitPrice, sumPrice, taxRate,
 *          unitTaxAmountFullAggregation, sumTaxAmountFullAggregation,
 *          unitDiscountAmountAggregation, sumDiscountAmountAggregation)
 *
 * Spryker prices are already integer minor-unit amounts (cents).
 * Financial/fulfillment status is inferred from items and totals.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import type { JsonApiResource } from '../client'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Spryker shapes ────────────────────────────────────────────────────────

export interface RawSprykerOrderAddress {
  salutation?: string | null
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  address3?: string | null
  city?: string | null
  zipCode?: string | null
  iso2Code?: string | null
  country?: string | null
  phone?: string | null
  company?: string | null
}

export interface RawSprykerOrderTotals {
  expenseTotal?: number | null
  discountTotal?: number | null
  taxTotal?: number | null
  subtotal?: number | null
  grandTotal?: number | null
  canceledTotal?: number | null
  remunerationTotal?: number | null
}

export interface RawSprykerOrderItem {
  id?: number | string | null
  sku?: string | null
  sumPrice?: number | null
  unitPrice?: number | null
  name?: string | null
  quantity?: number | null
  taxRate?: number | null
  unitTaxAmountFullAggregation?: number | null
  sumTaxAmountFullAggregation?: number | null
  unitDiscountAmountAggregation?: number | null
  sumDiscountAmountAggregation?: number | null
  state?: string | null
  stateDisplayName?: string | null
  productOptions?: unknown[]
  metadata?: unknown
  [key: string]: unknown
}

export interface RawSprykerOrderAttributes {
  orderReference: string
  createdAt?: string | null
  updatedAt?: string | null
  currencyIsoCode?: string | null
  priceMode?: string | null
  totals?: RawSprykerOrderTotals | null
  billingAddress?: RawSprykerOrderAddress | null
  shippingAddress?: RawSprykerOrderAddress | null
  items?: RawSprykerOrderItem[]
  expenses?: Array<{
    type?: string
    name?: string
    sumPrice?: number | null
    unitPrice?: number | null
    sumTaxAmount?: number | null
    taxRate?: number | null
  }>
  payments?: Array<{ amount?: number | null; paymentProviderName?: string; paymentMethodName?: string }>
  calculatedDiscounts?: Record<string, { unitAmount?: number | null; sumAmount?: number | null; displayName?: string; code?: string | null }>
  [key: string]: unknown
}

export type RawSprykerOrder = JsonApiResource<RawSprykerOrderAttributes>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawSprykerOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = [raw.address2, raw.address3].filter(Boolean).join(', ') || undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const country = raw.iso2Code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

function mapLineItem(raw: RawSprykerOrderItem, currency: string): LineItem {
  const price = raw.unitPrice ?? 0
  const taxAmount = raw.unitTaxAmountFullAggregation ?? 0
  const taxRate = raw.taxRate ?? 0

  return {
    id: raw.id != null ? String(raw.id) : raw.sku ?? 'unknown',
    sku: raw.sku ?? undefined,
    title: raw.name ?? raw.sku ?? '',
    quantity: raw.quantity ?? 1,
    price: { amount: price, currency },
    taxLines:
      taxRate > 0
        ? [
            {
              title: `Tax ${taxRate}%`,
              rate: taxRate / 100,
              amount: { amount: taxAmount, currency },
            },
          ]
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Infer financial status from order totals and payment data.
 * Spryker does not expose a single financial_status field — we derive it.
 */
function inferFinancialStatus(
  attrs: RawSprykerOrderAttributes,
): OrderFinancialStatus | undefined {
  const payments = attrs.payments ?? []
  if (payments.length === 0) return 'PENDING'
  const paidAmount = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const grandTotal = attrs.totals?.grandTotal ?? 0
  if (paidAmount >= grandTotal) return 'PAID'
  if (paidAmount > 0) return 'PARTIALLY_PAID'
  return 'PENDING'
}

/**
 * Infer fulfillment status from item states.
 * Spryker item states include: "payment pending", "confirmed", "picking",
 * "shipped", "delivered", "cancelled", etc.
 */
function inferFulfillmentStatus(
  items: RawSprykerOrderItem[],
): OrderFulfillmentStatus | undefined {
  if (items.length === 0) return undefined
  const states = items.map((i) => (i.state ?? '').toLowerCase())
  const allFulfilled = states.every(
    (s) => s === 'delivered' || s === 'shipped' || s.includes('delivered') || s.includes('shipped'),
  )
  const anyFulfilled = states.some(
    (s) => s === 'delivered' || s === 'shipped' || s.includes('delivered') || s.includes('shipped'),
  )
  const allCancelled = states.every((s) => s.includes('cancel'))
  if (allCancelled) return 'RESTOCKED'
  if (allFulfilled) return 'FULFILLED'
  if (anyFulfilled) return 'PARTIAL'
  return 'UNFULFILLED'
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSprykerOrder): Order {
  const attrs = raw.attributes
  const currency = attrs.currencyIsoCode ?? 'EUR'
  const money = (amount: number | null | undefined) =>
    amount != null ? { amount, currency } : undefined

  const totals = attrs.totals ?? {}
  const items = attrs.items ?? []
  const discountCodes = Object.values(attrs.calculatedDiscounts ?? {})
    .map((d) => d.code)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)

  return {
    id: raw.id,
    orderNumber: attrs.orderReference,
    name: attrs.orderReference,
    currency,
    subtotalPrice: money(totals.subtotal),
    totalTax: money(totals.taxTotal),
    totalDiscounts: money(totals.discountTotal),
    totalShipping: money(totals.expenseTotal),
    totalPrice: money(totals.grandTotal),
    financialStatus: inferFinancialStatus(attrs),
    fulfillmentStatus: inferFulfillmentStatus(items),
    lineItems: items.map((item) => mapLineItem(item, currency)),
    billingAddress: mapAddress(attrs.billingAddress),
    shippingAddress: mapAddress(attrs.shippingAddress),
    discountCodes: discountCodes.length > 0 ? discountCodes : undefined,
    createdAt: toIsoDatetime(attrs.createdAt),
    updatedAt: toIsoDatetime(attrs.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
