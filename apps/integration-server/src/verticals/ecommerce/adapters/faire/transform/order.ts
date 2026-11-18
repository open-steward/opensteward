/**
 * Faire ExternalOrderV2 → canonical Order.
 *
 * Faire orders are wholesale orders placed by retailers. Every field read below
 * is a documented property of ExternalOrderV2, ExternalOrderItemV2,
 * ExternalAddressV2, ExternalShipmentV2 or ExternalPayoutCostsV2 in the spec
 * (developers.faire.com/docs).
 *
 * The order has no documented grand total or retailer-payment status. The
 * money it does document is the brand's side (`payout_costs`), of which the
 * subtotal, discounts and tax are the order's own amounts. Financial status is
 * left unset rather than guessed from the fulfilment state.
 */

import type { LineItem, Order, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'
import { faireVariantKey, type RawFaireMoney } from './product'

// ── Raw Faire shapes ─────────────────────────────────────────────────────────

/** ExternalAddressV2. */
export interface RawFaireOrderAddress {
  id?: string
  name?: string
  address1?: string
  address2?: string
  postal_code?: string
  city?: string
  /** "The full name of the state or province." */
  state?: string
  /** "The ISO 3166 two-letter code for the state or province." */
  state_code?: string
  phone_number?: string
  country?: string
  /** "The ISO alpha-3 country code." */
  country_code?: string
  company_name?: string
  [key: string]: unknown
}

/** ExternalOrderItemV2. */
export interface RawFaireOrderItem {
  id: string
  created_at?: string
  updated_at?: string
  order_id?: string
  product_id?: string
  variant_id?: string
  quantity?: number
  sku?: string
  /** "in USD cents. Deprecated - use price instead." */
  price_cents?: number
  product_name?: string
  variant_name?: string
  includes_tester?: boolean
  price?: RawFaireMoney
  state?: string
  [key: string]: unknown
}

/** ExternalShipmentV2. */
export interface RawFaireShipment {
  id?: string
  order_id?: string
  carrier?: string
  tracking_code?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/** ExternalPayoutCostsV2 (the money fields read here). */
export interface RawFairePayoutCosts {
  subtotal_after_brand_discounts?: RawFaireMoney
  total_brand_discounts?: RawFaireMoney
  net_tax?: RawFaireMoney
  [key: string]: unknown
}

/** ExternalOrderV2. */
export interface RawFaireOrder {
  id: string
  display_id?: string
  created_at?: string
  updated_at?: string
  /** ExternalOrderV2.State. */
  state?: string
  items?: RawFaireOrderItem[]
  shipments?: RawFaireShipment[]
  address?: RawFaireOrderAddress
  payout_costs?: RawFairePayoutCosts
  retailer_id?: string
  notes?: string
  cancelled_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(raw: RawFaireMoney | undefined): Money | undefined {
  if (raw?.amount_minor == null || !raw.currency) return undefined
  return { amount: raw.amount_minor, currency: raw.currency }
}

/** `price` (ExternalMoneyV2), else the deprecated `price_cents`, documented "in USD cents". */
function itemPrice(raw: RawFaireOrderItem): Money {
  const price = money(raw.price)
  if (price) return price
  if (raw.price_cents != null) return { amount: raw.price_cents, currency: 'USD' }
  throw new Error(`Faire order item ${raw.id} has no price`)
}

function mapAddress(raw: RawFaireOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const address: Address = {
    line1: raw.address1 || undefined,
    line2: raw.address2 || undefined,
    city: raw.city || undefined,
    region: raw.state_code || undefined,
    postalCode: raw.postal_code || undefined,
    country: toIso3166Alpha2(raw.country_code),
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

/**
 * ExternalOrderV2.State → canonical fulfilment status. The enum is NEW,
 * PROCESSING, PRE_TRANSIT, IN_TRANSIT, DELIVERED, CANCELED, BACKORDERED,
 * PENDING_RETAILER_CONFIRMATION. A cancelled order has no fulfilment status;
 * its `cancelled_at` carries the cancellation.
 */
function mapFulfillment(state: string | undefined): OrderFulfillmentStatus | undefined {
  switch (state) {
    case undefined:
    case 'CANCELED':
      return undefined
    case 'NEW':
    case 'PROCESSING':
    case 'BACKORDERED':
    case 'PENDING_RETAILER_CONFIRMATION':
      return 'UNFULFILLED'
    case 'PRE_TRANSIT':
    case 'IN_TRANSIT':
    case 'DELIVERED':
      return 'FULFILLED'
    default:
      return 'unknown'
  }
}

function mapLineItem(raw: RawFaireOrderItem): LineItem {
  if (!raw.product_name) throw new Error(`Faire order item ${raw.id} has no product_name`)
  if (raw.quantity == null) throw new Error(`Faire order item ${raw.id} has no quantity`)
  return {
    id: raw.id,
    productId: raw.product_id || undefined,
    // The canonical variant id is productId:variantId (see faireVariantKey),
    // so a line item names its variant only when it carries both.
    variantId:
      raw.product_id && raw.variant_id
        ? faireVariantKey(raw.product_id, raw.variant_id)
        : undefined,
    title: raw.product_name,
    quantity: raw.quantity,
    price: itemPrice(raw),
    sku: raw.sku || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawFaireOrder): Order {
  const lineItems = (raw.items ?? []).map(mapLineItem)
  const shipmentIds = (raw.shipments ?? []).map((s) => s.id).filter((id): id is string => !!id)
  const subtotal = money(raw.payout_costs?.subtotal_after_brand_discounts)

  return {
    id: raw.id,
    orderNumber: raw.display_id || undefined,
    customerId: raw.retailer_id || undefined,
    currency: subtotal?.currency,
    subtotalPrice: subtotal,
    totalDiscounts: money(raw.payout_costs?.total_brand_discounts),
    totalTax: money(raw.payout_costs?.net_tax),
    fulfillmentStatus: mapFulfillment(raw.state),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.address),
    fulfillmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    note: raw.notes || undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    cancelledAt: toIsoDatetime(raw.cancelled_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
