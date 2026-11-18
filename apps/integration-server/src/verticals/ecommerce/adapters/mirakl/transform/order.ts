/**
 * Mirakl Order → canonical Order.
 *
 * Mirakl structures orders differently from single-vendor platforms:
 *  - An "order" is a top-level marketplace purchase that groups one or
 *    more `order_lines`, each associated with a single seller offer.
 *  - Money fields are objects: `{ amount: number, currency_iso_code: string }`.
 *  - Dates use ISO-8601 with timezone offsets.
 *
 * Status mapping:
 *   STAGING / WAITING_ACCEPTANCE / WAITING_DEBIT → {PENDING, UNFULFILLED}
 *   WAITING_DEBIT_PAYMENT                        → {AUTHORIZED, UNFULFILLED}
 *   SHIPPING                                     → {PAID, UNFULFILLED}
 *   SHIPPED / TO_COLLECT / INCIDENT_OPEN         → {PAID, PARTIAL}
 *   RECEIVED / CLOSED / INCIDENT_CLOSED          → {PAID, FULFILLED}
 *   REFUSED / CANCELED                           → {VOIDED, UNFULFILLED}
 *   REFUNDED                                     → {REFUNDED, FULFILLED}
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

// ── Raw Mirakl shapes ────────────────────────────────────────────────────────

export interface RawMiraklMoney {
  amount?: number | null
  currency_iso_code?: string | null
}

export interface RawMiraklAddress {
  city?: string | null
  civility?: string | null
  company?: string | null
  country?: string | null
  country_iso_code?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  phone_secondary?: string | null
  state?: string | null
  street_1?: string | null
  street_2?: string | null
  zip_code?: string | null
}

export interface RawMiraklCustomer {
  customer_id?: string | null
  billing_address?: RawMiraklAddress | null
  shipping_address?: RawMiraklAddress | null
  locale?: string | null
  email?: string | null
}

export interface RawMiraklOrderLine {
  id?: string | null
  offer_id?: string | null
  offer_sku?: string | null
  product_sku?: string | null
  product_title?: string | null
  offer_title?: string | null
  quantity?: number | null
  price?: RawMiraklMoney | null
  shipping_price?: RawMiraklMoney | null
  total_price?: RawMiraklMoney | null
  taxes?: Array<{ amount?: RawMiraklMoney; code?: string; rate?: number }> | null
  status?: string | null
  [key: string]: unknown
}

export interface RawMiraklOrder {
  order_id?: string | null
  order_state?: string | null
  currency_iso_code?: string | null
  created_date?: string | null
  last_updated_date?: string | null
  payment_date?: string | null
  customer?: RawMiraklCustomer | null
  order_lines?: RawMiraklOrderLine[] | null
  total_price?: RawMiraklMoney | null
  /** Alias for total_price on some API versions. */
  price?: RawMiraklMoney | null
  total_shipping_price?: RawMiraklMoney | null
  payment_type?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(
  raw: RawMiraklMoney | null | undefined,
  fallbackCurrency: string,
): { amount: number; currency: string } | undefined {
  if (!raw || raw.amount == null) return undefined
  const cur = raw.currency_iso_code ?? fallbackCurrency
  return { amount: majorToMinor(raw.amount, cur), currency: cur }
}

function mapAddress(raw: RawMiraklAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street_1 ?? undefined
  const line2 = raw.street_2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip_code ?? undefined
  const country = raw.country_iso_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(state: string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  switch (state) {
    case 'STAGING':
    case 'WAITING_ACCEPTANCE':
    case 'WAITING_DEBIT':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'WAITING_DEBIT_PAYMENT':
      return { financialStatus: 'AUTHORIZED', fulfillmentStatus: 'UNFULFILLED' }
    case 'SHIPPING':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'SHIPPED':
    case 'TO_COLLECT':
    case 'INCIDENT_OPEN':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'RECEIVED':
    case 'CLOSED':
    case 'INCIDENT_CLOSED':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'REFUSED':
    case 'CANCELED':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'REFUNDED':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'FULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawMiraklOrderLine, currency: string): LineItem {
  const priceAmt = raw.price?.amount ?? 0
  const cur = raw.price?.currency_iso_code ?? currency
  const qty = raw.quantity != null && raw.quantity > 0 ? raw.quantity : 1
  return {
    id: String(raw.id ?? raw.offer_id ?? ''),
    productId: raw.offer_id != null ? String(raw.offer_id) : undefined,
    title: raw.product_title ?? raw.offer_title ?? raw.offer_sku ?? '',
    quantity: qty,
    price: { amount: majorToMinor(priceAmt, cur), currency: cur },
    sku: raw.offer_sku ?? raw.product_sku ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawMiraklOrder): Order {
  const currency = raw.currency_iso_code ?? 'EUR'
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.order_state)
  const billing = mapAddress(raw.customer?.billing_address)
  const shipping = mapAddress(raw.customer?.shipping_address)

  const isCancelled = raw.order_state === 'CANCELED' || raw.order_state === 'REFUSED'

  return {
    id: String(raw.order_id ?? ''),
    orderNumber: raw.order_id ?? undefined,
    name: raw.order_id ?? undefined,
    customerId: raw.customer?.customer_id ?? undefined,
    email: raw.customer?.email ?? undefined,
    phone:
      raw.customer?.billing_address?.phone ??
      raw.customer?.billing_address?.phone_secondary ??
      undefined,
    currency,
    totalPrice: toMoney(raw.total_price ?? raw.price, currency),
    totalShipping: toMoney(raw.total_shipping_price, currency),
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.order_lines ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: billing,
    shippingAddress: shipping,
    createdAt: toIsoDatetime(raw.created_date) ?? raw.created_date ?? undefined,
    updatedAt: toIsoDatetime(raw.last_updated_date) ?? raw.last_updated_date ?? undefined,
    processedAt: toIsoDatetime(raw.payment_date) ?? raw.payment_date ?? undefined,
    cancelledAt: isCancelled
      ? (toIsoDatetime(raw.last_updated_date) ?? raw.last_updated_date ?? undefined)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
