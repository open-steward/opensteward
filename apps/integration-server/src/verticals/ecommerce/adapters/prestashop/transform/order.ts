/**
 * PrestaShop Order → canonical Order.
 *
 * PrestaShop orders live under `/api/orders`. The order state is a
 * numeric ID (`current_state`) that maps to the store's configured
 * order states. Default PrestaShop state IDs:
 *
 *   1  Awaiting bank wire   → {PENDING,  UNFULFILLED}
 *   2  Payment accepted     → {PAID,     UNFULFILLED}
 *   3  Processing           → {PAID,     UNFULFILLED}
 *   4  Shipped              → {PAID,     FULFILLED}
 *   5  Delivered            → {PAID,     FULFILLED}
 *   6  Cancelled            → {VOIDED,   UNFULFILLED}
 *   7  Refunded             → {REFUNDED, UNFULFILLED}
 *   8  Payment error        → {VOIDED,   UNFULFILLED}
 *   9  On backorder (paid)  → {PAID,     PARTIAL}
 *  10  Awaiting bank wire   → {PENDING,  UNFULFILLED}
 *  11  Awaiting PayPal      → {PENDING,  UNFULFILLED}
 *  12  Remote payment       → {PENDING,  UNFULFILLED}
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw PrestaShop shapes ───────────────────────────────────────────────────

export interface RawPrestaShopOrderRow {
  id?: number | string
  product_id?: number | string
  product_attribute_id?: number | string
  product_name?: string
  product_quantity?: number | string
  product_price?: string | number
  unit_price_tax_incl?: string | number
  unit_price_tax_excl?: string | number
  total_price_tax_incl?: string | number
  product_reference?: string | null
  [key: string]: unknown
}

export interface RawPrestaShopOrder {
  id: number | string
  reference?: string | null
  id_customer?: number | string | null
  current_state?: number | string | null
  payment?: string | null
  module?: string | null
  total_paid?: string | number
  total_paid_tax_incl?: string | number
  total_paid_tax_excl?: string | number
  total_products?: string | number
  total_products_wt?: string | number
  total_shipping?: string | number
  total_shipping_tax_incl?: string | number
  total_discounts?: string | number
  total_discounts_tax_incl?: string | number
  id_currency?: number | string | null
  id_address_delivery?: number | string | null
  id_address_invoice?: number | string | null
  associations?: {
    order_rows?: RawPrestaShopOrderRow[]
  }
  date_add?: string
  date_upd?: string
  // Enriched by adapter:
  _billing_address?: Record<string, unknown>
  _shipping_address?: Record<string, unknown>
  _currency_iso?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Math.round(n * 100) / 100
}

function mapStatuses(stateId: number | string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (stateId == null) return {}
  const id = typeof stateId === 'string' ? parseInt(stateId, 10) : stateId
  switch (id) {
    case 1:
    case 10:
    case 11:
    case 12:
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 2:
    case 3:
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 4:
    case 5:
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 6:
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 7:
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    case 8:
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 9:
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    default:
      return {}
  }
}

function mapAddress(raw: Record<string, unknown> | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = (raw['address1'] as string) ?? undefined
  const line2 = (raw['address2'] as string) ?? undefined
  const city = (raw['city'] as string) ?? undefined
  const postalCode = (raw['postcode'] as string) ?? undefined
  const country = raw['id_country'] != null ? String(raw['id_country']) : undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

function mapLineItem(raw: RawPrestaShopOrderRow, currency: string): LineItem {
  const unitPrice = toNum(raw.unit_price_tax_incl ?? raw.product_price)
  const qty = typeof raw.product_quantity === 'string'
    ? parseInt(raw.product_quantity, 10)
    : (raw.product_quantity ?? 1)
  return {
    id: raw.id != null ? String(raw.id) : String(raw.product_id ?? ''),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId:
      raw.product_attribute_id != null && raw.product_attribute_id !== 0 && raw.product_attribute_id !== '0'
        ? String(raw.product_attribute_id)
        : undefined,
    title: raw.product_name ?? '',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    sku: raw.product_reference ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawPrestaShopOrder): Order {
  const currency = raw._currency_iso ?? 'EUR'
  const money = (v: string | number | null | undefined) => ({ amount: majorToMinor(toNum(v), currency), currency })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.current_state)
  const lineItems = (raw.associations?.order_rows ?? []).map((li) => mapLineItem(li, currency))

  return {
    id: String(raw.id),
    orderNumber: raw.reference ?? undefined,
    name: raw.reference != null ? `#${raw.reference}` : undefined,
    customerId: raw.id_customer != null ? String(raw.id_customer) : undefined,
    currency,
    subtotalPrice: raw.total_products_wt != null ? money(raw.total_products_wt) : undefined,
    totalShipping: raw.total_shipping_tax_incl != null ? money(raw.total_shipping_tax_incl) : undefined,
    totalDiscounts: raw.total_discounts_tax_incl != null ? money(raw.total_discounts_tax_incl) : undefined,
    totalPrice: raw.total_paid_tax_incl != null ? money(raw.total_paid_tax_incl) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: mapAddress(raw._billing_address),
    shippingAddress: mapAddress(raw._shipping_address),
    note: undefined,
    createdAt: toIsoDatetime(raw.date_add),
    updatedAt: toIsoDatetime(raw.date_upd),
    cancelledAt:
      raw.current_state != null && Number(raw.current_state) === 6
        ? raw.date_upd
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → PrestaShop order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    id_customer: order.customerId,
    payment: order.metadata?.['payment'] as string | undefined,
    module: order.metadata?.['module'] as string | undefined,
    line_items: order.lineItems?.map((li) => ({
      product_id: li.productId,
      product_attribute_id: li.variantId,
      product_quantity: li.quantity,
      product_name: li.title,
      product_reference: li.sku,
    })),
  }
}
