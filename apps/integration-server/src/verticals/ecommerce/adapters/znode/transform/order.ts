/**
 * Znode Order → canonical Order.
 *
 * Znode orders reference an Account (company) via `AccountId` and
 * a user via `UserId`. B2B-specific fields:
 *
 *  - `metadata.userId` → the person who placed the order
 *  - `metadata.purchaseOrderNumber` → PO number (B2B concept)
 *  - `metadata.accountId` → the account/company
 *
 * Order status mapping (Znode OrderStateId → canonical):
 *  - 1 (Pending)       → {PENDING,  UNFULFILLED}
 *  - 2 (Processing)    → {PAID,     UNFULFILLED}
 *  - 3 (Shipped)       → {PAID,     PARTIAL}
 *  - 4 (Delivered)     → {PAID,     FULFILLED}
 *  - 5 (Cancelled)     → {VOIDED,   UNFULFILLED}
 *  - 6 (Returned)      → {REFUNDED, RESTOCKED}
 *  - 7 (On Hold)       → {PENDING,  UNFULFILLED}
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

// ── Raw Znode shapes ─────────────────────────────────────────────────────────

export interface RawZnodeAddress {
  Address1?: string
  Address2?: string
  CityName?: string
  StateName?: string
  PostalCode?: string
  CountryName?: string
  PhoneNumber?: string
  FirstName?: string
  LastName?: string
  [key: string]: unknown
}

export interface RawZnodeLineItem {
  OrderLineItemId?: number
  SKU?: string
  ProductName?: string
  Quantity?: number
  Price?: number
  CurrencyCode?: string
  ExtendedPrice?: number
  ProductId?: number
  UnitOfMeasure?: string
  ShipDate?: string
  Description?: string
  [key: string]: unknown
}

export interface RawZnodeOrder {
  OrderId?: number
  OrderNumber?: string
  PurchaseOrderNumber?: string
  CurrencyCode?: string
  SubTotal?: number
  Total?: number
  TaxCost?: number
  DiscountAmount?: number
  ShippingCost?: number
  OrderStateId?: number
  OrderStateName?: string
  CreatedDate?: string
  ModifiedDate?: string
  CustomerNotes?: string
  AccountId?: number | null
  UserId?: number | null
  BillingAddress?: RawZnodeAddress | null
  ShippingAddress?: RawZnodeAddress | null
  OrderLineItems?: RawZnodeLineItem[]
  Email?: string
  PhoneNumber?: string
  DiscountCodes?: string[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawZnodeAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.Address1
  const line2 = raw.Address2
  const city = raw.CityName
  const region = raw.StateName
  const postalCode = raw.PostalCode
  const country = raw.CountryName
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(stateId: number | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (stateId == null) return {}
  switch (stateId) {
    case 1: // Pending
    case 7: // On Hold
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 2: // Processing
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 3: // Shipped
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 4: // Delivered
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 5: // Cancelled
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 6: // Returned
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'RESTOCKED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawZnodeLineItem, currency: string): LineItem {
  return {
    id: String(raw.OrderLineItemId ?? ''),
    productId: raw.ProductId != null ? String(raw.ProductId) : undefined,
    title: raw.ProductName ?? raw.Description ?? '',
    quantity: raw.Quantity ?? 0,
    price: {
      amount: majorToMinor(
        raw.Price ?? raw.ExtendedPrice ?? 0,
        raw.CurrencyCode ?? currency,
      ),
      currency: raw.CurrencyCode ?? currency,
    },
    sku: raw.SKU,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawZnodeOrder): Order {
  const currency = raw.CurrencyCode ?? 'USD'
  const money = (v: number | undefined | null) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.OrderStateId)

  return {
    id: String(raw.OrderId ?? ''),
    orderNumber: raw.OrderNumber,
    name: raw.OrderNumber ? `#${raw.OrderNumber}` : undefined,
    customerId: raw.AccountId != null ? String(raw.AccountId) : undefined,
    email: raw.Email,
    phone: raw.PhoneNumber,
    currency,
    subtotalPrice: money(raw.SubTotal),
    totalTax: money(raw.TaxCost),
    totalDiscounts: money(raw.DiscountAmount),
    totalShipping: money(raw.ShippingCost),
    totalPrice: money(raw.Total),
    financialStatus,
    fulfillmentStatus,
    lineItems: raw.OrderLineItems?.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.BillingAddress),
    shippingAddress: mapAddress(raw.ShippingAddress),
    note: raw.CustomerNotes,
    discountCodes: raw.DiscountCodes,
    createdAt: toIsoDatetime(raw.CreatedDate),
    updatedAt: toIsoDatetime(raw.ModifiedDate),
    cancelledAt: raw.OrderStateId === 5 ? raw.ModifiedDate : undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      userId: raw.UserId != null ? String(raw.UserId) : undefined,
      purchaseOrderNumber: raw.PurchaseOrderNumber,
      accountId: raw.AccountId != null ? String(raw.AccountId) : undefined,
    },
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    PurchaseOrderNumber: (order.metadata as Record<string, unknown> | undefined)?.['purchaseOrderNumber'],
    CustomerNotes: order.note,
  }
}
