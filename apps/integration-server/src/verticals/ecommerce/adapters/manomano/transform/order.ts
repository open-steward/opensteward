/**
 * ManoMano Order → canonical Order.
 *
 * ManoMano Orders API response envelope:
 *   {
 *     content: [
 *       {
 *         order_reference: string,   // the order identifier (NOT "id")
 *         seller_contract_id: string,
 *         status: string,
 *         products: [               // line items are under "products"
 *           {
 *             id: string,
 *             sku: string,
 *             product_title: string,
 *             quantity: number,
 *             unit_price: { amount: number, currency: string },  // money object
 *             total_price: { amount: number, currency: string }
 *           }
 *         ],
 *         addresses: {              // addresses under "addresses" key
 *           shipping: {
 *             firstname: string,
 *             lastname: string,
 *             address_line1: string,
 *             address_line2: string,
 *             city: string,
 *             zipcode: string,      // NOT postal_code
 *             country_iso: string,  // ISO country code (NOT country_code)
 *             phone: string
 *           },
 *           billing: { ... same shape ... }
 *         },
 *         customer: {              // buyer info under "customer"
 *           id: string,
 *           email: string,
 *           firstname: string,     // NOT first_name
 *           lastname: string,      // NOT last_name
 *           phone: string
 *         },
 *         total_amount: { amount: number, currency: string },  // money object
 *         subtotal_amount: { amount: number, currency: string },
 *         shipping_amount: { amount: number, currency: string },
 *         tax_amount: { amount: number, currency: string },
 *         created_at: string,
 *         updated_at: string,
 *         accepted_at: string | null,
 *         cancelled_at: string | null
 *       }
 *     ],
 *     pagination: { items: number, ... }
 *   }
 *
 * Docs: https://www.manomano.dev/
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

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

/** Money object returned by ManoMano for amount fields. */
export interface RawManomanoMoney {
  amount?: number | null
  currency?: string
}

export interface RawManomanoAddress {
  firstname?: string | null
  lastname?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  /** ManoMano uses "zipcode" not "postal_code" */
  zipcode?: string | null
  /** ManoMano uses "country_iso" not "country_code" */
  country_iso?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawManomanoOrderLine {
  id: string | number
  sku?: string | null
  product_title?: string
  quantity: number
  /** Money object — ManoMano wraps prices in {amount, currency} objects */
  unit_price?: RawManomanoMoney | null
  total_price?: RawManomanoMoney | null
  [key: string]: unknown
}

/** Buyer info lives under "customer" key on ManoMano orders. */
export interface RawManomanoBuyer {
  id?: string | number
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
}

export interface RawManomanoOrder {
  /** Primary order identifier on ManoMano — use order_reference as canonical id */
  order_reference?: string | null
  seller_contract_id?: string | null
  status?: string | null
  /** Line items live under "products" key */
  products?: RawManomanoOrderLine[]
  /** Address container with shipping/billing sub-objects */
  addresses?: {
    shipping?: RawManomanoAddress | null
    billing?: RawManomanoAddress | null
  } | null
  /** Buyer info lives under "customer" key */
  customer?: RawManomanoBuyer | null
  /** Money objects — amounts are {amount, currency} not flat numbers */
  total_amount?: RawManomanoMoney | null
  subtotal_amount?: RawManomanoMoney | null
  shipping_amount?: RawManomanoMoney | null
  tax_amount?: RawManomanoMoney | null
  created_at?: string
  updated_at?: string
  accepted_at?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
  [key: string]: unknown
}

// ── Status mappings ──────────────────────────────────────────────────────────

/**
 * ManoMano order statuses. The REST API documents the following values:
 *   PENDING, ACCEPTED, CANCELLED, SHIPPED, DELIVERED, REFUNDED
 * Map to canonical financial / fulfillment status as best-fit.
 */
const FINANCIAL_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  accepted: 'PAID',
  shipped: 'PAID',
  delivered: 'PAID',
  refunded: 'REFUNDED',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
}

const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  pending: 'UNFULFILLED',
  accepted: 'UNFULFILLED',
  shipped: 'FULFILLED',
  delivered: 'FULFILLED',
  refunded: 'RESTOCKED',
  cancelled: 'RESTOCKED',
  canceled: 'RESTOCKED',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function moneyObjToMinor(
  obj: RawManomanoMoney | null | undefined,
  fallbackCurrency: string,
): { amount: number; currency: string } | undefined {
  if (!obj) return undefined
  const currency = obj.currency ?? fallbackCurrency
  const amount = obj.amount != null ? majorToMinor(obj.amount, currency) : 0
  return { amount, currency }
}

function mapAddress(raw: RawManomanoAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_line1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country_iso ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_line2 ?? undefined,
    city,
    postalCode,
    country,
  }
}

function mapLineItem(raw: RawManomanoOrderLine, fallbackCurrency: string): LineItem {
  const unit = moneyObjToMinor(raw.unit_price, fallbackCurrency)
  return {
    id: String(raw.id),
    title: raw.product_title ?? '',
    sku: raw.sku ?? undefined,
    quantity: raw.quantity,
    price: unit ?? { amount: 0, currency: fallbackCurrency },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawManomanoOrder): Order {
  // Derive a display currency from any available money object
  const currency =
    raw.total_amount?.currency ??
    raw.subtotal_amount?.currency ??
    'EUR'

  const status = (raw.status ?? '').toLowerCase()

  return {
    // ManoMano's canonical order id is order_reference
    id: raw.order_reference ?? '',
    orderNumber: raw.order_reference ?? undefined,
    name: raw.order_reference ?? undefined,
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? raw.addresses?.shipping?.phone ?? undefined,
    currency,
    subtotalPrice: moneyObjToMinor(raw.subtotal_amount, currency),
    totalTax: moneyObjToMinor(raw.tax_amount, currency),
    totalShipping: moneyObjToMinor(raw.shipping_amount, currency),
    totalPrice: moneyObjToMinor(raw.total_amount, currency),
    financialStatus: status ? FINANCIAL_STATUS_MAP[status] ?? undefined : undefined,
    fulfillmentStatus: status ? FULFILLMENT_STATUS_MAP[status] ?? undefined : undefined,
    // Line items live under "products" key
    lineItems: (raw.products ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.addresses?.billing),
    shippingAddress: mapAddress(raw.addresses?.shipping),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    processedAt: toIsoDatetime(raw.accepted_at),
    cancelledAt: toIsoDatetime(raw.cancelled_at),
    cancelReason: raw.cancel_reason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
