/**
 * Wayfair Dropship Orders API (v2) `SupplierDropshipOrder` → canonical Order.
 *
 * Every field read here is documented in the v2 reference,
 * https://developer.wayfair.io/posts/docs/dropship-orders-api/reference/GraphQL/v2.0.0
 * (quotes verbatim):
 *   purchaseOrderNumber - String!  "Store-prefixed PO number, e.g. CS665334026."
 *   createdAt - DateTime           "When the purchase order was created."
 *   status - SupplierDropshipOrderStatus!  "Supplier-facing status of the order."
 *   shippingAddress / billingAddress / customer - PostalAddress!
 *   lineItems - [SupplierDropshipLineItem!]!  "empty rather than null when none are published"
 *   Money: amount - String! "Decimal amount, e.g. "45.50"."; currencyCode - CurrencyCode!
 *
 * What is deliberately NOT mapped:
 *   - financialStatus and order totals: the read publishes neither.
 *   - Address country: the API sends "ISO 3166-1 alpha-3 country code, e.g.
 *     USA", and the canonical address takes alpha-2. It stays in metadata.
 *   - A line item whose unitPrice, quantity or name is null (unitPrice
 *     "Nullable ... a partial hydration can leave absent"). The canonical line
 *     needs all three, so the order is published without `lineItems` rather
 *     than with a partial list; the raw lines stay in metadata.
 */

import { z } from 'zod'
import { toIsoDatetime } from '@opensteward/shared'
import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes (v2 reference types) ─────────────────────────────────────────

export interface RawWayfairMoney {
  amount: string
  currencyCode: string
}

export interface RawWayfairPostalAddress {
  name?: string | null
  address1?: string | null
  address2?: string | null
  address3?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  phoneNumber?: string | null
  email?: string | null
}

export interface RawWayfairDropshipLineItem {
  supplierPartNumber?: string | null
  quantity?: number | null
  unitPrice?: RawWayfairMoney | null
  status?: string | null
  name?: string | null
  listingId?: string | null
  orderValue?: RawWayfairMoney | null
}

export interface RawWayfairDropshipOrder {
  __typename?: 'SupplierDropshipOrder'
  purchaseOrderNumber: string
  createdAt?: string | null
  customerOrderId?: string | null
  orderType?: string | null
  status: string
  mustShipByDate?: string | null
  storeName?: string | null
  customer?: RawWayfairPostalAddress | null
  shippingInfo?: { shipSpeed?: string | null; carrierCode?: string | null } | null
  warehouseDetails?: { id: number } | null
  billingAddress?: RawWayfairPostalAddress | null
  shippingAddress?: RawWayfairPostalAddress | null
  lineItems?: RawWayfairDropshipLineItem[] | null
  tasks?: Array<{ taskType?: string | null; status?: string | null } | null> | null
}

export interface RawWayfairDropshipOrderIssue {
  __typename: 'SupplierDropshipOrderIssue'
  purchaseOrderNumber: string
  code: string
  message: string
  remediation: string
}

export type RawWayfairDropshipOrderResult = RawWayfairDropshipOrder | RawWayfairDropshipOrderIssue

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SupplierDropshipOrderStatus → canonical fulfillment status. The members and
 * their descriptions are the reference's:
 *   NEW "Received, not yet worked." · PROCESSING "Being prepared by the
 *   supplier." · STAGED "Staged for pickup." · READY_FOR_PICKUP "Staged and
 *   awaiting carrier pickup."                              → UNFULFILLED
 *   PICKED_UP_AWAITING_CARRIER_SCAN "Collected from the supplier, not yet
 *   scanned by the carrier." · IN_TRANSIT_CARRIER_SCAN_RECEIVED "Handed to the
 *   carrier and scanned by it." · DELIVERED "Delivered to the customer."
 *                                                          → FULFILLED
 *   CANCELLED, RETURNED, or anything else                  → unknown
 */
const FULFILLMENT_STATUS: Record<string, OrderFulfillmentStatus> = {
  NEW: 'UNFULFILLED',
  PROCESSING: 'UNFULFILLED',
  STAGED: 'UNFULFILLED',
  READY_FOR_PICKUP: 'UNFULFILLED',
  PICKED_UP_AWAITING_CARRIER_SCAN: 'FULFILLED',
  IN_TRANSIT_CARRIER_SCAN_RECEIVED: 'FULFILLED',
  DELIVERED: 'FULFILLED',
}

function fulfillmentStatus(status: string | null | undefined): OrderFulfillmentStatus | undefined {
  if (status == null) return undefined
  return FULFILLMENT_STATUS[status] ?? 'unknown'
}

function money(raw: RawWayfairMoney | null | undefined): Money | undefined {
  if (raw == null) return undefined
  const major = Number(raw.amount)
  if (raw.amount.trim() === '' || !Number.isFinite(major)) return undefined
  return { amount: majorToMinor(major, raw.currencyCode), currency: raw.currencyCode }
}

function address(raw: RawWayfairPostalAddress | null | undefined): Address | undefined {
  if (raw == null) return undefined
  const mapped: Address = {
    line1: raw.address1 ?? undefined,
    line2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    region: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
  }
  return Object.values(mapped).some((v) => v != null) ? mapped : undefined
}

function lineItem(
  raw: RawWayfairDropshipLineItem,
  index: number,
  purchaseOrderNumber: string,
): LineItem | undefined {
  const price = money(raw.unitPrice)
  if (price === undefined || raw.quantity == null || raw.name == null) return undefined
  return {
    // Lines carry no id of their own; the PO number and the line's position
    // in the documented `lineItems` list identify it.
    id: `${purchaseOrderNumber}:${index + 1}`,
    sku: raw.supplierPartNumber ?? undefined,
    title: raw.name,
    quantity: raw.quantity,
    price,
    fulfillmentStatus: fulfillmentStatus(raw.status),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

const Email = z.email()

// ── Transform ───────────────────────────────────────────────────────────────

export function transformDropshipOrder(raw: RawWayfairDropshipOrder): Order {
  const rawLines = raw.lineItems ?? []
  const mapped = rawLines.map((li, i) => lineItem(li, i, raw.purchaseOrderNumber))
  const lineItems = mapped.every((li): li is LineItem => li !== undefined) ? mapped : undefined

  // Order currency only when every line's unit price names the same one.
  const currencies = new Set((lineItems ?? []).map((li) => li.price.currency))
  const currency = currencies.size === 1 ? [...currencies][0] : undefined

  const email = raw.customer?.email
  return {
    id: raw.purchaseOrderNumber,
    orderNumber: raw.purchaseOrderNumber,
    name: raw.purchaseOrderNumber,
    email: email != null && Email.safeParse(email).success ? email : undefined,
    phone: raw.customer?.phoneNumber ?? undefined,
    currency,
    fulfillmentStatus: fulfillmentStatus(raw.status),
    lineItems,
    billingAddress: address(raw.billingAddress),
    shippingAddress: address(raw.shippingAddress),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
