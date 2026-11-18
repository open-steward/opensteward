/**
 * Shift4Shop Order → canonical Order.
 *
 * Shift4Shop orders live under `/Orders`. The `OrderStatusID` numeric field
 * maps to canonical financial + fulfillment status pairs.
 *
 * Default Shift4Shop OrderStatusID mapping:
 *   1  New          → {PENDING,    UNFULFILLED}
 *   2  Processing   → {PENDING,    PARTIAL}
 *   3  Shipped      → {PAID,       FULFILLED}
 *   4  Cancelled    → {VOIDED,     CANCELLED} (fulfillment: RESTOCKED)
 *   5  On Hold      → {PENDING,    UNFULFILLED}
 *   6  Returned     → {REFUNDED,   RESTOCKED}
 *  11  Awaiting     → {PENDING,    UNFULFILLED}
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

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopOrderItem {
  CatalogID?: number | string | null
  ItemID?: number | string | null
  ItemIndexID?: number | string | null
  ItemDescription?: string | null
  ItemQuantity?: number | string | null
  ItemUnitPrice?: number | string | null
  ItemSalePrice?: number | string | null
  ItemTax?: number | string | null
  CatalogIDVariant?: number | string | null
  ItemOptionCode?: string | null
  [key: string]: unknown
}

export interface RawShift4ShopAddress {
  FirstName?: string | null
  LastName?: string | null
  Address?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Country?: string | null
  Phone?: string | null
  Email?: string | null
  [key: string]: unknown
}

export interface RawShift4ShopShipment {
  ShipmentID?: number | string | null
  ShipmentBoxes?: number | string | null
  ShipmentTrackingCode?: string | null
  ShipmentMethodName?: string | null
  ShipmentDate?: string | null
  [key: string]: unknown
}

export interface RawShift4ShopOrder {
  InvoiceNumberPrefix?: string | null
  InvoiceNumber?: number | string | null
  CustomerID?: number | string | null
  OrderStatusID?: number | string | null
  OrderDate?: string | null
  LastUpdate?: string | null
  OrderAmount?: number | string | null
  TaxCost?: number | string | null
  ShipCost?: number | string | null
  DiscountAmt?: number | string | null
  Subtotal?: number | string | null
  CurrencyCode?: string | null
  BillingAddress?: RawShift4ShopAddress | null
  ShipmentList?: RawShift4ShopShipment[] | null
  OrderItemList?: RawShift4ShopOrderItem[] | null
  CustomerEmail?: string | null
  CustomerPhone?: string | null
  Notes?: string | null
  CancelledDate?: string | null
  CancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** Parse a decimal major-unit value and convert to integer minor units. */
function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapStatuses(statusId: number | string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (statusId == null) return {}
  const id = typeof statusId === 'string' ? parseInt(statusId, 10) : statusId
  switch (id) {
    case 1:
    case 5:
    case 11:
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 2:
      return { financialStatus: 'PENDING', fulfillmentStatus: 'PARTIAL' }
    case 3:
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 4:
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'RESTOCKED' }
    case 6:
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'RESTOCKED' }
    default:
      return {}
  }
}

function mapAddress(raw: RawShift4ShopAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.Address ?? undefined
  const line2 = raw.Address2 ?? undefined
  const city = raw.City ?? undefined
  const region = raw.State ?? undefined
  const postalCode = raw.Zip ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapLineItem(raw: RawShift4ShopOrderItem, currency: string): LineItem {
  const id = raw.ItemIndexID != null ? String(raw.ItemIndexID) : String(raw.ItemID ?? raw.CatalogID ?? '')
  const qty = toNum(raw.ItemQuantity) || 1
  const unitPrice = toMinor(raw.ItemSalePrice ?? raw.ItemUnitPrice, currency)

  return {
    id,
    productId: raw.CatalogID != null ? String(raw.CatalogID) : undefined,
    variantId: raw.CatalogIDVariant != null && raw.CatalogIDVariant !== 0 && raw.CatalogIDVariant !== '0'
      ? String(raw.CatalogIDVariant)
      : undefined,
    title: raw.ItemDescription ?? '',
    quantity: qty,
    price: { amount: unitPrice, currency },
    sku: raw.ItemOptionCode || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawShift4ShopOrder): Order {
  const currency = raw.CurrencyCode ?? 'USD'
  const money = (v: number | string | null | undefined) => ({ amount: toMinor(v, currency), currency })

  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.OrderStatusID)

  const orderId = raw.InvoiceNumberPrefix != null
    ? `${raw.InvoiceNumberPrefix}${raw.InvoiceNumber ?? ''}`
    : String(raw.InvoiceNumber ?? '')

  const lineItems = (raw.OrderItemList ?? []).map((li) => mapLineItem(li, currency))

  const fulfillmentIds = (raw.ShipmentList ?? [])
    .filter((s) => s.ShipmentID != null)
    .map((s) => String(s.ShipmentID))

  // Shipping address comes from first shipment record, which may not be in raw.
  // Billing address is embedded in BillingAddress field.
  const billingAddress = mapAddress(raw.BillingAddress)

  const isCancelled = raw.OrderStatusID != null && Number(raw.OrderStatusID) === 4

  return {
    id: orderId,
    orderNumber: String(raw.InvoiceNumber ?? orderId),
    name: orderId ? `#${orderId}` : undefined,
    customerId: raw.CustomerID != null ? String(raw.CustomerID) : undefined,
    email: raw.CustomerEmail ?? undefined,
    phone: raw.CustomerPhone ?? undefined,
    currency,
    subtotalPrice: raw.Subtotal != null ? money(raw.Subtotal) : undefined,
    totalTax: raw.TaxCost != null ? money(raw.TaxCost) : undefined,
    totalShipping: raw.ShipCost != null ? money(raw.ShipCost) : undefined,
    totalDiscounts: raw.DiscountAmt != null ? money(raw.DiscountAmt) : undefined,
    totalPrice: raw.OrderAmount != null ? money(raw.OrderAmount) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress,
    fulfillmentIds: fulfillmentIds.length > 0 ? fulfillmentIds : undefined,
    note: raw.Notes ?? undefined,
    createdAt: toIsoDatetime(raw.OrderDate),
    updatedAt: toIsoDatetime(raw.LastUpdate),
    cancelledAt: isCancelled ? (raw.CancelledDate ?? raw.LastUpdate ?? undefined) : undefined,
    cancelReason: isCancelled ? (raw.CancelReason ?? undefined) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
