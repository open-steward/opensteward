/**
 * Kaufland Marketplace Order → canonical Order.
 *
 * Kaufland orders are modelled as a collection of order-units. Each order
 * identified by `id_order` contains one or more order-units, each of which
 * is an individual line item. Prices are returned in eurocents (integer
 * minor units) so no majorToMinor conversion is needed for EUR-storefront
 * values.
 *
 * The GET /orders endpoint returns the order header with an array of
 * order_units embedded. The GET /order-units endpoint exposes per-unit
 * detail including buyer, billing/shipping address, and per-unit status.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-orders
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandAddress {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  street?: string | null
  house_number?: string | null
  postcode?: string | null
  additional_field?: string | null
  city?: string | null
  phone?: string | null
  country?: string | null
}

export interface RawKauflandBuyer {
  id_buyer?: number | string | null
  email?: string | null
}

export interface RawKauflandProduct {
  id_product?: number | string | null
  title?: string | null
  eans?: string[]
}

export interface RawKauflandOrderUnit {
  id_order_unit: number | string
  id_order?: string | null
  id_offer?: string | null
  status?: string | null
  /** Price in minor units (eurocents for EUR storefronts). */
  price?: number | null
  revenue_gross?: number | null
  revenue_net?: number | null
  shipping_rate?: number | null
  vat?: number | null
  currency?: string | null
  buyer?: RawKauflandBuyer | null
  billing_address?: RawKauflandAddress | null
  shipping_address?: RawKauflandAddress | null
  product?: RawKauflandProduct | null
  fulfillment_type?: string | null
  cancel_reason?: string | null
  note?: string | null
  ts_created_iso?: string | null
  ts_updated_iso?: string | null
  [key: string]: unknown
}

export interface RawKauflandOrder {
  id_order: string
  storefront?: string | null
  fulfillment_type?: string | null
  /** ISO timestamp for when the order was created. */
  ts_created_iso?: string | null
  /** ISO timestamp of last order-unit update. */
  ts_units_updated_iso?: string | null
  order_units?: RawKauflandOrderUnit[]
  order_units_count?: number | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawKauflandAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const houseNum = raw.house_number ?? undefined
  const line1 = street && houseNum ? `${street} ${houseNum}` : (street ?? houseNum ?? undefined)
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.additional_field ?? undefined,
    city,
    postalCode,
    country,
  }
}

/** Map Kaufland order-unit status to canonical fulfillment status. */
const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  need_to_be_sent: 'UNFULFILLED',
  sent: 'FULFILLED',
  cancelled: 'RESTOCKED',
  returned: 'RESTOCKED',
}

function mapOrderUnitStatus(status: string | null | undefined): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  return FULFILLMENT_STATUS_MAP[status.toLowerCase()] ?? undefined
}

function mapLineItem(unit: RawKauflandOrderUnit, currency: string): LineItem {
  return {
    id: String(unit.id_order_unit),
    productId: unit.product?.id_product != null ? String(unit.product.id_product) : undefined,
    variantId: unit.id_offer ?? undefined,
    title: unit.product?.title ?? unit.id_offer ?? String(unit.id_order_unit),
    quantity: 1,
    price: { amount: unit.price ?? 0, currency },
    fulfillmentStatus: mapOrderUnitStatus(unit.status),
    metadata: unit as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform a Kaufland order (with embedded order-units) to the canonical
 * Order type.
 *
 * Kaufland orders:
 * - Do NOT have a `financial_status` field; payment is managed by Kaufland.
 * - Do NOT expose a `customer` object on the order level — buyer details are
 *   on each order-unit (billing_address.email is the closest equivalent).
 * - Prices on order-units are already in minor units (integer eurocents).
 */
export function transformOrder(raw: RawKauflandOrder): Order {
  const units = raw.order_units ?? []
  const firstUnit = units[0]
  const currency = firstUnit?.currency ?? 'EUR'

  // Derive billing/shipping addresses from the first order-unit.
  const billingAddress = mapAddress(firstUnit?.billing_address)
  const shippingAddress = mapAddress(firstUnit?.shipping_address)
  const buyerEmail = firstUnit?.buyer?.email ?? undefined
  const buyerId = firstUnit?.buyer?.id_buyer != null ? String(firstUnit.buyer.id_buyer) : undefined

  // Aggregate total price: sum of unit prices + shipping.
  const totalPrice = units.reduce((sum, u) => sum + (u.price ?? 0), 0)
  const totalShipping = units.reduce((sum, u) => sum + (u.shipping_rate ?? 0), 0)

  // Fulfillment status: FULFILLED if all units are sent, otherwise UNFULFILLED.
  const allSent = units.length > 0 && units.every((u) => u.status === 'sent')
  const anyCancelled = units.every((u) => u.status === 'cancelled')
  const fulfillmentStatus: OrderFulfillmentStatus | undefined = anyCancelled
    ? 'RESTOCKED'
    : allSent
    ? 'FULFILLED'
    : units.length > 0
    ? 'UNFULFILLED'
    : undefined

  return {
    id: String(raw.id_order),
    orderNumber: String(raw.id_order),
    name: `#${raw.id_order}`,
    customerId: buyerId,
    email: buyerEmail,
    currency,
    totalPrice: totalPrice > 0 ? { amount: totalPrice, currency } : undefined,
    totalShipping: totalShipping > 0 ? { amount: totalShipping, currency } : undefined,
    // Kaufland does not expose subtotal or tax breakdown at the order level.
    fulfillmentStatus,
    lineItems: units.map((u) => mapLineItem(u, currency)),
    billingAddress,
    shippingAddress,
    note: firstUnit?.note ?? undefined,
    createdAt: raw.ts_created_iso ?? undefined,
    updatedAt: raw.ts_units_updated_iso ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a single order-unit to the canonical Order type. Useful when the
 * caller fetches from /order-units directly (e.g. for a per-unit status
 * update).
 */
export function transformOrderUnit(unit: RawKauflandOrderUnit): Order {
  return transformOrder({
    id_order: String(unit.id_order ?? unit.id_order_unit),
    ts_created_iso: unit.ts_created_iso,
    ts_units_updated_iso: unit.ts_updated_iso,
    order_units: [unit],
  })
}
