/**
 * Volusion Order → canonical Order.
 *
 * Volusion orders use PascalCase field names. Financial/fulfillment statuses
 * are mapped to the canonical UPPER_SNAKE enums.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawVolusionOrderAddress {
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  PostalCode?: string | null
  Country?: string | null
}

export interface RawVolusionLineItem {
  OrderDetailID: number | string
  ProductID?: number | string | null
  ProductCode?: string | null
  ProductName: string
  Quantity: number
  UnitPrice?: number | string
  TotalPrice?: number | string
  [key: string]: unknown
}

export interface RawVolusionOrder {
  OrderID: number | string
  OrderNumber?: number | string
  CustomerID?: number | string | null
  CustomerEmail?: string | null
  CustomerPhone?: string | null
  Currency?: string
  SubTotal?: number | string
  TotalTax?: number | string
  TotalDiscount?: number | string
  TotalShipping?: number | string
  GrandTotal?: number | string
  PaymentStatus?: string | null
  ShipmentStatus?: string | null
  OrderDetails?: RawVolusionLineItem[]
  BillingAddress?: RawVolusionOrderAddress | null
  ShippingAddress?: RawVolusionOrderAddress | null
  CouponCode?: string | null
  OrderNotes?: string | null
  DateCreated?: string | null
  LastModified?: string | null
  CancelledAt?: string | null
  CancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined, currency: string = 'USD'): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isNaN(n) ? 0 : majorToMinor(n, currency)
}

function mapAddress(raw: RawVolusionOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.Address1 ?? undefined
  const city = raw.City ?? undefined
  const country = raw.Country ?? undefined
  const postalCode = raw.PostalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.Address2 ?? undefined,
    city,
    region: raw.State ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  paid: 'PAID',
  partially_paid: 'PARTIALLY_PAID',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY_REFUNDED',
  voided: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  not_shipped: 'UNFULFILLED',
  partial: 'PARTIAL',
  partially_shipped: 'PARTIAL',
  fulfilled: 'FULFILLED',
  shipped: 'FULFILLED',
}

function mapLineItem(raw: RawVolusionLineItem, currency: string): LineItem {
  return {
    id: String(raw.OrderDetailID),
    productId: raw.ProductID != null ? String(raw.ProductID) : undefined,
    title: raw.ProductName,
    quantity: raw.Quantity,
    price: { amount: toNum(raw.UnitPrice, currency), currency },
    sku: raw.ProductCode ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawVolusionOrder): Order {
  const currency = raw.Currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: toNum(v, currency),
    currency,
  })

  return {
    id: String(raw.OrderID),
    orderNumber: raw.OrderNumber != null ? String(raw.OrderNumber) : undefined,
    customerId: raw.CustomerID != null ? String(raw.CustomerID) : undefined,
    email: raw.CustomerEmail ?? undefined,
    phone: raw.CustomerPhone ?? undefined,
    currency,
    subtotalPrice: raw.SubTotal != null ? money(raw.SubTotal) : undefined,
    totalTax: raw.TotalTax != null ? money(raw.TotalTax) : undefined,
    totalDiscounts: raw.TotalDiscount != null ? money(raw.TotalDiscount) : undefined,
    totalShipping: raw.TotalShipping != null ? money(raw.TotalShipping) : undefined,
    totalPrice: raw.GrandTotal != null ? money(raw.GrandTotal) : undefined,
    financialStatus: raw.PaymentStatus
      ? FIN_STATUS_MAP[raw.PaymentStatus.toLowerCase()] ?? undefined
      : undefined,
    fulfillmentStatus: raw.ShipmentStatus
      ? FUL_STATUS_MAP[raw.ShipmentStatus.toLowerCase()] ?? undefined
      : undefined,
    lineItems: (raw.OrderDetails ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.BillingAddress),
    shippingAddress: mapAddress(raw.ShippingAddress),
    discountCodes: raw.CouponCode ? [raw.CouponCode] : undefined,
    note: raw.OrderNotes ?? undefined,
    createdAt: raw.DateCreated ?? undefined,
    updatedAt: raw.LastModified ?? undefined,
    cancelledAt: raw.CancelledAt ?? undefined,
    cancelReason: raw.CancelReason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Volusion order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustomerEmail: order.email,
    CustomerPhone: order.phone,
    Currency: order.currency,
    OrderNotes: order.note,
    CouponCode: order.discountCodes?.[0],
    OrderDetails: order.lineItems?.map((li) => ({
      ProductID: li.productId,
      Quantity: li.quantity,
      UnitPrice: li.price?.amount,
      ProductName: li.title,
      ProductCode: li.sku,
    })),
  }
}
