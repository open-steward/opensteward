/**
 * OroCommerce Order → canonical Order.
 *
 * OroCommerce orders reference both a Customer (company) via
 * `relationships.customer` and an owner CustomerUser (person) via
 * `relationships.customerUser`. B2B-specific fields:
 *
 *  - `metadata.ownerCustomerUserId` → the person who placed the order
 *  - `metadata.poNumber` → purchase order number (B2B concept)
 *  - `metadata.shoppingListId` → source shopping list if applicable
 *
 * Order status mapping (Oro internal_status → canonical):
 *  - open          → {PENDING,  UNFULFILLED}
 *  - pending       → {PENDING,  UNFULFILLED}
 *  - processing    → {PAID,     UNFULFILLED}
 *  - shipped       → {PAID,     PARTIAL}
 *  - closed        → {PAID,     FULFILLED}
 *  - cancelled     → {VOIDED,   UNFULFILLED}
 *  - wait_for_approval → {PENDING, UNFULFILLED}
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

// ── Raw Oro shapes ────────────────────────────────────────────────────────────

export interface RawOroOrderAddress {
  street?: string
  street2?: string
  city?: string
  region?: string
  regionText?: string
  postalCode?: string
  country?: string
  phone?: string
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export interface RawOroLineItem {
  id: string
  productSku?: string
  productName?: string
  quantity?: number
  price?: number
  currency?: string
  value?: number
  freeFormProduct?: string
  productId?: string
  productUnitCode?: string
  shipBy?: string
  comment?: string
  [key: string]: unknown
}

export interface RawOroOrder {
  id: string
  identifier?: string | number
  poNumber?: string
  currency?: string
  subtotalValue?: number
  totalValue?: number
  totalTax?: number
  totalDiscounts?: number
  shippingCostAmount?: number
  internalStatus?: string // open | pending | processing | shipped | closed | cancelled
  status?: string
  createdAt?: string
  updatedAt?: string
  customerNotes?: string
  customer?: { id: string } | null
  customerUser?: { id: string } | null
  shoppingList?: { id: string } | null
  billingAddress?: RawOroOrderAddress | null
  shippingAddress?: RawOroOrderAddress | null
  lineItems?: RawOroLineItem[]
  email?: string
  phone?: string
  discountCodes?: string[]
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawOroOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street
  const line2 = raw.street2
  const city = raw.city
  const region = raw.region ?? raw.regionText
  const postalCode = raw.postalCode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status) {
    case 'open':
    case 'pending':
    case 'wait_for_approval':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'processing':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'shipped':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'closed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawOroLineItem, currency: string): LineItem {
  return {
    id: raw.id,
    productId: raw.productId,
    title: raw.productName ?? raw.freeFormProduct ?? '',
    quantity: raw.quantity ?? 0,
    price: {
      amount: majorToMinor(raw.price ?? raw.value ?? 0, raw.currency ?? currency),
      currency: raw.currency ?? currency,
    },
    sku: raw.productSku,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawOroOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: number | undefined | null) =>
    v != null ? { amount: majorToMinor(v, currency), currency } : undefined
  const statusKey = raw.internalStatus ?? raw.status
  const { financialStatus, fulfillmentStatus } = mapStatuses(statusKey)

  return {
    id: raw.id,
    orderNumber:
      raw.identifier != null ? String(raw.identifier) : undefined,
    name:
      raw.identifier != null ? `#${raw.identifier}` : undefined,
    customerId: raw.customer?.id ?? undefined,
    email: raw.email,
    phone: raw.phone,
    currency,
    subtotalPrice: money(raw.subtotalValue),
    totalTax: money(raw.totalTax),
    totalDiscounts: money(raw.totalDiscounts),
    totalShipping: money(raw.shippingCostAmount),
    totalPrice: money(raw.totalValue),
    financialStatus,
    fulfillmentStatus,
    lineItems: raw.lineItems?.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    note: raw.customerNotes,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    cancelledAt: statusKey === 'cancelled' ? raw.updatedAt : undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      ownerCustomerUserId: raw.customerUser?.id ?? undefined,
      poNumber: raw.poNumber,
      shoppingListId: raw.shoppingList?.id ?? undefined,
    },
  }
}

export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  return {
    data: {
      type: 'orders',
      attributes: {
        poNumber: (order.metadata as Record<string, unknown> | undefined)?.['poNumber'],
        customerNotes: order.note,
      },
    },
  }
}
