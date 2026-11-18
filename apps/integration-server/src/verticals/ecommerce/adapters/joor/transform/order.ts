/**
 * JOOR Order → canonical Order.
 *
 * JOOR orders have: id, status, customer, collection, total, quantity,
 * date_created, date_approved, date_modified, shipping/billing addresses,
 * payment_method, tracking_number, po_number, discount, tax.
 *
 * JOOR statuses: IN_PROGRESS, NOTES, PENDING, APPROVED, SHIPPED, CANCELLED.
 * We map these to the canonical financial/fulfillment status enums.
 *
 * Docs: https://api-docs.jooraccess.com/reference/get-orders-1.md
 */

import type {
  Order,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw JOOR shapes ──────────────────────────────────────────────────────────

export interface RawJoorAddress {
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

export interface RawJoorOrderCustomer {
  id?: string
  code?: string
  name?: string
  email?: string
}

export interface RawJoorOrderCollection {
  id?: string
  code?: string
  name?: string
}

export interface RawJoorOrderDiscount {
  discount?: number
  details?: unknown[]
}

export interface RawJoorOrderTax {
  amount?: number
  number?: string
}

export interface RawJoorOrder {
  id: string
  status?: string | null
  shipping_address?: RawJoorAddress | null
  billing_address?: RawJoorAddress | null
  customer?: RawJoorOrderCustomer | null
  buyer?: { name?: string; email?: string } | null
  collection?: RawJoorOrderCollection | null
  price_type?: { id?: string; name?: string } | null
  payment_method?: { id?: string; code?: string; name?: string } | null
  total?: number | string | null
  quantity?: number | null
  date_created?: string | null
  date_approved?: string | null
  date_modified?: string | null
  tracking_number?: string | null
  po_number?: string | null
  comments?: string | null
  internal_comments?: string | null
  discount?: RawJoorOrderDiscount | null
  tax?: RawJoorOrderTax | null
  export_status?: string | null
  export_description?: string | null
  exported_on?: string | null
  delivery_window_start?: string | null
  delivery_window_end?: string | null
  sales_representative?: { id?: string; username?: string } | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawJoorAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

/**
 * JOOR status → canonical financial + fulfillment statuses.
 *
 * JOOR uses one status field for both financial and fulfillment state.
 * We map it to the closest canonical pair.
 */
function mapStatuses(status: string | null | undefined): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  switch ((status ?? '').toUpperCase()) {
    case 'IN_PROGRESS':
    case 'NOTES':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'PENDING':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'APPROVED':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'SHIPPED':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'CANCELLED':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'RESTOCKED' }
    default:
      return { financialStatus: undefined, fulfillmentStatus: undefined }
  }
}

function toMinor(v: number | string | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(n, currency)
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawJoorOrder): Order {
  const currency = 'USD' // JOOR does not expose a per-order currency field at order level
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)

  const totalAmount = raw.total != null ? toMinor(raw.total, currency) : undefined

  return {
    id: raw.id,
    customerId: raw.customer?.id ?? undefined,
    note: raw.comments ?? raw.internal_comments ?? undefined,
    currency,
    totalPrice: totalAmount != null ? { amount: totalAmount, currency } : undefined,
    financialStatus,
    fulfillmentStatus,
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.date_modified),
    processedAt: toIsoDatetime(raw.date_approved),
    cancelledAt:
      (raw.status ?? '').toUpperCase() === 'CANCELLED' ? toIsoDatetime(raw.date_modified) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → JOOR order body for bulk_create / bulk_update. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    status: (() => {
      // Map canonical financial status back to JOOR status (approximate)
      if (order.cancelledAt) return 'CANCELLED'
      switch (order.financialStatus) {
        case 'PAID':
          return order.fulfillmentStatus === 'FULFILLED' ? 'SHIPPED' : 'APPROVED'
        case 'VOIDED':
          return 'CANCELLED'
        default:
          return 'IN_PROGRESS'
      }
    })(),
    comments: order.note,
    tracking_number: (order as Record<string, unknown>)['trackingNumber'] ?? undefined,
    po_number: (order as Record<string, unknown>)['poNumber'] ?? undefined,
  }
}

