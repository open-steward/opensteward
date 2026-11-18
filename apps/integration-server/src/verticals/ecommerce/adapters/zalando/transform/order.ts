/**
 * Zalando zDirect Order → canonical Order.
 *
 * Zalando orders use snake_case field names. The order status comes from
 * `order_status` (CREATED, IN_PROGRESS, SHIPPED, DELIVERED, CANCELED,
 * RETURNED). Financial status is inferred from the order status since Zalando
 * does not expose a separate payment status in the Orders API (payments are
 * handled by Zalando internally).
 *
 * Order units (line items) are nested inside the `order_units` array.
 * Each unit carries `article.ean`, `quantity`, `price.amount` (decimal major
 * units), and `price.currency`.
 *
 * Docs: https://developers.merchants.zalando.com/docs/orders.html
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

// ── Raw Zalando shapes ────────────────────────────────────────────────────────

export interface RawZalandoAddress {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  zip?: string | null
  country_code?: string | null
}

export interface RawZalandoPrice {
  amount: string | number
  currency: string
}

export interface RawZalandoArticle {
  ean?: string | null
  model_id?: string | null
  name?: string | null
  size?: string | null
  color?: string | null
}

export interface RawZalandoOrderUnit {
  order_unit_id: string
  article?: RawZalandoArticle
  quantity?: number
  price?: RawZalandoPrice
  tax?: RawZalandoPrice
  fulfillment_status?: string | null
}

export interface RawZalandoOrder {
  order_number: string
  order_date?: string | null
  last_modified?: string | null
  order_status?: string | null
  payment_method?: string | null
  delivery_type?: string | null
  currency?: string | null
  billing_address?: RawZalandoAddress | null
  delivery_address?: RawZalandoAddress | null
  order_units?: RawZalandoOrderUnit[]
  sales_channel?: string | null
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

function mapAddress(raw: RawZalandoAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_line_1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country_code ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_line_2 ?? undefined,
    city,
    postalCode,
    country,
  }
}

/**
 * Map Zalando order status to canonical financial status.
 * Zalando handles payments internally; orders reach CREATED only after
 * payment is confirmed, so CREATED === PAID.
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  CREATED: 'PAID',
  IN_PROGRESS: 'PAID',
  SHIPPED: 'PAID',
  DELIVERED: 'PAID',
  CANCELED: 'VOIDED',
  RETURNED: 'REFUNDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  CREATED: 'UNFULFILLED',
  IN_PROGRESS: 'PARTIAL',
  SHIPPED: 'FULFILLED',
  DELIVERED: 'FULFILLED',
  CANCELED: 'RESTOCKED',
  RETURNED: 'RESTOCKED',
}

/** Map per-unit fulfillment status */
const UNIT_FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  INITIAL: 'UNFULFILLED',
  PREPARED: 'UNFULFILLED',
  READY_FOR_PICKUP: 'PARTIAL',
  CANCELED: 'RESTOCKED',
  DELIVERED: 'FULFILLED',
  RETURNED: 'RESTOCKED',
}

function mapLineItem(raw: RawZalandoOrderUnit, currency: string): LineItem {
  const article = raw.article
  const priceAmount = raw.price
    ? { amount: toMinor(raw.price.amount, raw.price.currency ?? currency), currency: raw.price.currency ?? currency }
    : { amount: 0, currency }

  return {
    id: raw.order_unit_id,
    // Use model_id as a product-level reference (EAN identifies a specific variant)
    productId: article?.model_id ?? undefined,
    variantId: article?.ean ?? undefined,
    title: article?.name ?? raw.order_unit_id,
    sku: article?.ean ?? undefined,
    quantity: raw.quantity ?? 1,
    price: priceAmount,
    fulfillmentStatus: raw.fulfillment_status
      ? UNIT_FUL_STATUS_MAP[raw.fulfillment_status] ?? undefined
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawZalandoOrder): Order {
  const currency = raw.currency ?? (raw.order_units?.[0]?.price?.currency ?? 'EUR')
  const units = raw.order_units ?? []
  const orderStatus = raw.order_status ?? ''

  // Compute total price from order units
  let totalMinor = 0
  let totalTaxMinor = 0
  for (const unit of units) {
    if (unit.price) {
      totalMinor += toMinor(unit.price.amount, unit.price.currency ?? currency)
    }
    if (unit.tax) {
      totalTaxMinor += toMinor(unit.tax.amount, unit.tax.currency ?? currency)
    }
  }

  return {
    id: raw.order_number,
    orderNumber: raw.order_number,
    name: raw.order_number,
    currency,
    totalPrice: totalMinor > 0 ? { amount: totalMinor, currency } : undefined,
    totalTax: totalTaxMinor > 0 ? { amount: totalTaxMinor, currency } : undefined,
    financialStatus: orderStatus ? FIN_STATUS_MAP[orderStatus] ?? undefined : undefined,
    fulfillmentStatus: orderStatus ? FUL_STATUS_MAP[orderStatus] ?? undefined : undefined,
    lineItems: units.map((u) => mapLineItem(u, currency)),
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.delivery_address),
    createdAt: toIsoDatetime(raw.order_date),
    updatedAt: toIsoDatetime(raw.last_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
