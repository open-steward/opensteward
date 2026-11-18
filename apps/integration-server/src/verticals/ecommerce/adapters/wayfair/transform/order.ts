/**
 * Wayfair Purchase Order → canonical Order.
 *
 * Wayfair's `getDropshipPurchaseOrders` GraphQL query returns purchase orders
 * placed by Wayfair customers on the Wayfair marketplace. The supplier
 * receives these orders and is responsible for shipping directly to the
 * customer (dropship model).
 *
 * Key fields from Wayfair's PO response:
 *   poNumber          — unique PO identifier (maps to id + orderNumber)
 *   poDate            — ISO-8601 date when Wayfair placed the PO
 *   estimatedShipDate — requested ship-by date
 *   customerName      — ship-to customer's full name
 *   customerAddress1/2, customerCity, customerState, customerPostalCode
 *   orderType         — e.g. "DROP_SHIP"
 *   shippingInfo      — { shipSpeed, carrierCode }
 *   packingSlipUrl    — hosted PDF for packing slip
 *   products[]        — array of ordered SKUs
 *     partNumber      — supplier part number (maps to sku)
 *     quantity        — quantity ordered
 *     price           — unit price in USD (decimal major units)
 *
 * Financial status: Wayfair pays suppliers per PO; an accepted PO is
 * effectively "paid" from the supplier's perspective. We map open orders
 * to PENDING and acknowledged/shipped orders to PAID.
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWayfairProduct {
  partNumber: string
  quantity: number
  price?: number | string | null
  event?: {
    startDate?: string | null
    endDate?: string | null
  } | null
  [key: string]: unknown
}

export interface RawWayfairShippingInfo {
  shipSpeed?: string | null
  carrierCode?: string | null
  [key: string]: unknown
}

export interface RawWayfairWarehouse {
  id?: string | number | null
  name?: string | null
  [key: string]: unknown
}

export interface RawWayfairPurchaseOrder {
  poNumber: string
  poDate?: string | null
  estimatedShipDate?: string | null
  customerName?: string | null
  customerAddress1?: string | null
  customerAddress2?: string | null
  customerCity?: string | null
  customerState?: string | null
  customerPostalCode?: string | null
  orderType?: string | null
  shippingInfo?: RawWayfairShippingInfo | null
  packingSlipUrl?: string | null
  warehouse?: RawWayfairWarehouse | null
  products?: RawWayfairProduct[]
  /** Present when the adapter has applied an acceptOrder mutation. */
  acknowledged?: boolean | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY = 'USD' // Wayfair operates in USD

function toMinor(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(n, CURRENCY)
}

function mapShippingAddress(raw: RawWayfairPurchaseOrder): Address | undefined {
  const line1 = raw.customerAddress1 ?? undefined
  const city = raw.customerCity ?? undefined
  const postalCode = raw.customerPostalCode ?? undefined
  if (!line1 && !city && !postalCode) return undefined
  return {
    line1,
    line2: raw.customerAddress2 ?? undefined,
    city,
    region: raw.customerState ?? undefined,
    postalCode,
    country: 'US', // Wayfair's dropship operation is US-based
  }
}

function mapLineItem(raw: RawWayfairProduct, index: number): LineItem {
  return {
    // Wayfair products don't have a standalone id — synthesise from index
    id: `${raw.partNumber}-${index}`,
    sku: raw.partNumber,
    title: raw.partNumber, // Wayfair does not return a human title per line item
    quantity: raw.quantity,
    price: { amount: toMinor(raw.price), currency: CURRENCY },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawWayfairPurchaseOrder): Order {
  const lineItems = (raw.products ?? []).map((p, i) => mapLineItem(p, i))

  // Compute a simple total from line items when Wayfair doesn't surface one.
  const totalCents = lineItems.reduce(
    (sum, li) => sum + li.price.amount * li.quantity,
    0,
  )

  // Fulfillment status: Wayfair orders start unfulfilled; once shipped they
  // are fulfilled. We derive this from acknowledged field if present.
  const fulfillmentStatus: OrderFulfillmentStatus = raw.acknowledged
    ? 'FULFILLED'
    : 'UNFULFILLED'

  return {
    id: raw.poNumber,
    orderNumber: raw.poNumber,
    name: raw.poNumber,
    currency: CURRENCY,
    totalPrice: { amount: totalCents, currency: CURRENCY },
    financialStatus: 'PENDING', // Wayfair pays suppliers separately after ship confirmation
    fulfillmentStatus,
    lineItems,
    shippingAddress: mapShippingAddress(raw),
    note: raw.packingSlipUrl ? `Packing slip: ${raw.packingSlipUrl}` : undefined,
    processedAt: toIsoDatetime(raw.poDate),
    createdAt: toIsoDatetime(raw.poDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
