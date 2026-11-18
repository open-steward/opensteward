/**
 * Octopia order → canonical Order.
 *
 * `GET /orders` (list, envelope `{ items, itemsPerPage }`) and `GET
 * /orders/{orderId}` (bare object) — docs:
 * https://developer.octopia-io.net/api-reference/orders-management/ —
 * return, verbatim per the docs' own examples:
 *
 *   { "orderId": "...", "reference": "cmd_FFM_001", "status": "Accepted",
 *     "currencyCode": "EUR", "createdAt": "...", "updatedAt": "...",
 *     "purchasedAt": "...", "customer": { "reference": "custm_001" },
 *     "billingAddress": { "addressLine1", "addressLine2", "addressLine3",
 *       "postalCode", "city", "stateOrRegion", "countryCode", ... },
 *     "totalPrice": { "offerPrice": 130.97, "sellingPrice": 130.97 },
 *     "lines": [ { "orderLineId": "1RT2", "status": "Accepted", "quantity": 10,
 *       "sellingPrice": { "unitSalesPrice": 41.99, "shippingCost": 5, "taxes": [] },
 *       "offer": { "id", "sellerProductId", "productId", "productTitle", ... },
 *       "shippingAddress": { ..., "phone", "email" },
 *       "parcels": [ { "parcelNumber", "carrierName", "trackingUrl", "trackingId" } ] } ] }
 *
 * Unusually, `email`/`phone` live on each LINE's `shippingAddress`, not the
 * order — this adapter lifts the first line's shipping address/email/phone
 * up to the canonical order-level fields (a documented simplification; the
 * untouched per-line data survives in `metadata`).
 *
 * `status` enum (confirmed): Processing, WaitingAcceptance, Accepted,
 * Refused, InPreparation, Shipped, Delivered, Cancelled, Rejected. Octopia
 * exposes no payment/financial status on the order — `financialStatus` is
 * left unset rather than guessed.
 */
import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'
import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'

export interface RawOctopiaParcel {
  parcelNumber: string
  carrierName: string
  trackingUrl?: string
  trackingId?: string
}

export interface RawOctopiaLineAddress {
  firstName?: string
  lastName?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  postalCode?: string
  city?: string
  stateOrRegion?: string
  countryCode?: string
  phone?: string
  email?: string
}

export interface RawOctopiaOrderLineOffer {
  /** The offer's own id — confirmed present but not used by this transform. */
  id?: string
  productId: string
  productTitle: string
  sellerProductId?: string
}

export interface RawOctopiaOrderLineSellingPrice {
  unitSalesPrice: number
}

export interface RawOctopiaOrderLine {
  orderLineId: string
  quantity: number
  offer: RawOctopiaOrderLineOffer
  sellingPrice: RawOctopiaOrderLineSellingPrice
  shippingAddress?: RawOctopiaLineAddress
  parcels?: RawOctopiaParcel[]
}

export interface RawOctopiaOrder {
  orderId: string
  reference: string
  status: string
  currencyCode: string
  createdAt?: string
  updatedAt?: string
  purchasedAt?: string
  customer?: { reference?: string }
  billingAddress?: RawOctopiaLineAddress
  /** `offerPrice` is confirmed present too but not used by this transform. */
  totalPrice?: { offerPrice?: number; sellingPrice?: number }
  lines: RawOctopiaOrderLine[]
}

/** Map Octopia's order status to the canonical fulfillment status. */
export function mapFulfillmentStatus(status: string): OrderFulfillmentStatus {
  switch (status) {
    case 'Shipped':
      return 'PARTIAL'
    case 'Delivered':
      return 'FULFILLED'
    case 'Processing':
    case 'WaitingAcceptance':
    case 'Accepted':
    case 'InPreparation':
    case 'Refused':
    case 'Cancelled':
    case 'Rejected':
      return 'UNFULFILLED'
    default:
      return 'unknown'
  }
}

function mapAddress(raw: RawOctopiaLineAddress | undefined) {
  if (!raw) return undefined
  const country = raw.countryCode?.toUpperCase()
  return {
    line1: raw.addressLine1,
    line2: [raw.addressLine2, raw.addressLine3].filter(Boolean).join(' ') || undefined,
    city: raw.city,
    region: raw.stateOrRegion,
    postalCode: raw.postalCode,
    country: country && isIso3166Alpha2(country) ? country : undefined,
  }
}

function mapLineItem(raw: RawOctopiaOrderLine, currency: string): LineItem {
  return {
    id: raw.orderLineId,
    productId: raw.offer.productId,
    title: raw.offer.productTitle,
    quantity: raw.quantity,
    price: { amount: majorToMinor(raw.sellingPrice.unitSalesPrice, currency), currency },
    sku: raw.offer.sellerProductId,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawOctopiaOrder): Order {
  const currency = raw.currencyCode.toUpperCase()
  const firstLine = raw.lines[0]
  const isTerminalCancel = raw.status === 'Cancelled' || raw.status === 'Refused' || raw.status === 'Rejected'

  return {
    id: raw.orderId,
    orderNumber: raw.reference,
    name: raw.reference,
    customerId: raw.customer?.reference,
    email: firstLine?.shippingAddress?.email,
    phone: firstLine?.shippingAddress?.phone,
    currency,
    totalPrice:
      raw.totalPrice?.sellingPrice != null
        ? { amount: majorToMinor(raw.totalPrice.sellingPrice, currency), currency }
        : undefined,
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: raw.lines.map((l) => mapLineItem(l, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(firstLine?.shippingAddress),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    processedAt: toIsoDatetime(raw.purchasedAt),
    cancelledAt: isTerminalCancel ? toIsoDatetime(raw.updatedAt) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
