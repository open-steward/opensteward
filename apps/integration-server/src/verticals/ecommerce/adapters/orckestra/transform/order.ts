/**
 * Orckestra Order → canonical Order.
 *
 * Orckestra orders use a single `Status` string that encodes both
 * financial and fulfillment state. We fold this into canonical
 * `financialStatus` + `fulfillmentStatus` pairs:
 *
 *  New        → PENDING   / UNFULFILLED
 *  InProgress → PENDING   / PARTIAL
 *  Completed  → PAID      / FULFILLED
 *  Cancelled  → VOIDED    / CANCELLED  (note: CANCELLED is not in
 *               the canonical enum; we use RESTOCKED as the closest
 *               available value that indicates the order is no longer
 *               active — and mark via metadata)
 *
 * Because `OrderFulfillmentStatus` does not include CANCELLED, we map
 * Cancelled orders to `RESTOCKED` for fulfillmentStatus (indicating
 * stock has been returned) and set financialStatus to `VOIDED`.
 *
 * Line items come from `LineItems[]`. Shipment addresses come from the
 * first entry in `Shipments[]`.
 *
 * `metadata` is always the complete raw Orckestra order object.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawOrckestraAddress {
  Line1?: string | null
  Line2?: string | null
  City?: string | null
  RegionCode?: string | null
  PostalCode?: string | null
  CountryCode?: string | null
  [key: string]: unknown
}

export interface RawOrckestraLineItem {
  Id: string
  ProductId?: string | null
  VariantId?: string | null
  ProductName?: string | Record<string, string> | null
  Quantity?: number | null
  DefaultPrice?: number | null
  CurrentPrice?: number | null
  Sku?: string | null
  [key: string]: unknown
}

export interface RawOrckestraShipment {
  Id?: string | null
  ShippingAddress?: RawOrckestraAddress | null
  [key: string]: unknown
}

export interface RawOrckestraOrder {
  Id: string
  OrderNumber?: string | null
  Status?: string | null
  Total?: number | null
  SubTotal?: number | null
  TaxTotal?: number | null
  ShippingTotal?: number | null
  DiscountTotal?: number | null
  CustomerId?: string | null
  Email?: string | null
  PhoneNumber?: string | null
  Currency?: string | null
  BillingAddress?: RawOrckestraAddress | null
  Shipments?: RawOrckestraShipment[] | null
  LineItems?: RawOrckestraLineItem[] | null
  Notes?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
  CancelledDate?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

/** Orckestra order status → canonical financial status. */
export function toFinancialStatus(status: string | null | undefined): OrderFinancialStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
      return 'PAID'
    case 'cancelled':
    case 'canceled':
      return 'VOIDED'
    case 'inprogress':
    case 'in_progress':
      return 'PENDING'
    case 'new':
    default:
      return 'PENDING'
  }
}

/** Orckestra order status → canonical fulfillment status. */
export function toFulfillmentStatus(status: string | null | undefined): OrderFulfillmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
      return 'FULFILLED'
    case 'cancelled':
    case 'canceled':
      return 'RESTOCKED'
    case 'inprogress':
    case 'in_progress':
      return 'PARTIAL'
    case 'new':
    default:
      return 'UNFULFILLED'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAddress(raw: RawOrckestraAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.Line1 ?? undefined,
    line2: raw.Line2 ?? undefined,
    city: raw.City ?? undefined,
    region: raw.RegionCode ?? undefined,
    postalCode: raw.PostalCode ?? undefined,
    country: raw.CountryCode ?? undefined,
  }
}

function pickDisplayName(
  value: string | Record<string, string> | null | undefined,
): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return Object.values(value)[0] ?? ''
}

function toLineItem(
  raw: RawOrckestraLineItem,
  currency: string,
): LineItem {
  const unitPrice = raw.CurrentPrice ?? raw.DefaultPrice ?? 0
  return {
    id: raw.Id,
    productId: raw.ProductId ?? undefined,
    variantId: raw.VariantId ?? undefined,
    title: pickDisplayName(raw.ProductName) || raw.Id,
    quantity: raw.Quantity ?? 0,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    sku: raw.Sku ?? undefined,
    metadata: { raw },
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/** Transform a raw Orckestra order into a canonical Order. */
export function transformOrder(raw: RawOrckestraOrder): Order {
  const currency = raw.Currency ?? DEFAULT_CURRENCY
  const shipments = raw.Shipments ?? []
  const firstShipment = shipments[0] ?? null

  const lineItems = (raw.LineItems ?? []).map((li) => toLineItem(li, currency))

  return {
    id: raw.Id,
    orderNumber: raw.OrderNumber ?? undefined,
    customerId: raw.CustomerId ?? undefined,
    email: raw.Email ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    currency,
    totalPrice: raw.Total != null ? { amount: majorToMinor(raw.Total, currency), currency } : undefined,
    subtotalPrice: raw.SubTotal != null ? { amount: majorToMinor(raw.SubTotal, currency), currency } : undefined,
    totalTax: raw.TaxTotal != null ? { amount: majorToMinor(raw.TaxTotal, currency), currency } : undefined,
    totalShipping: raw.ShippingTotal != null ? { amount: majorToMinor(raw.ShippingTotal, currency), currency } : undefined,
    totalDiscounts:
      raw.DiscountTotal != null ? { amount: majorToMinor(raw.DiscountTotal, currency), currency } : undefined,
    financialStatus: toFinancialStatus(raw.Status),
    fulfillmentStatus: toFulfillmentStatus(raw.Status),
    lineItems,
    billingAddress: toAddress(raw.BillingAddress),
    shippingAddress: toAddress(firstShipment?.ShippingAddress),
    note: raw.Notes ?? undefined,
    createdAt: raw.CreatedDate ?? undefined,
    updatedAt: raw.LastModifiedDate ?? undefined,
    cancelledAt: raw.CancelledDate ?? undefined,
    metadata: { raw },
  }
}
