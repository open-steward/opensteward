/**
 * Directo sales order transform (maps to canonical Order).
 *
 * Endpoint: GET /v1/orders
 * Single: GET /v1/orders?number=<n>
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoOrderRow {
  rn?: number
  item?: string
  description?: string
  price?: number
  quantity?: number
  discount?: number
  vatcode?: string
  account?: string
  sum?: number
  [key: string]: unknown
}

export interface DirectoOrder {
  number?: string | number
  date?: string              // order date ISO-8601
  deliverydate?: string      // requested delivery date
  customercode?: string      // customer code
  customername?: string
  currency?: string
  sum?: number               // total incl. VAT
  vatsum?: number
  status?: string            // document status
  project?: string
  rows?: DirectoOrderRow[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: DirectoOrder): OrderStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'invoiced' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapLineitem(row: DirectoOrderRow): Lineitem {
  return {
    id: row.rn !== undefined ? String(row.rn) : undefined,
    accountId: row.account || undefined,
    itemId: row.item || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
    discountAmount: row.discount || undefined,
  }
}

// ── Public transforms ─────────────────────────────────────────────────────────

export function transformOrder(raw: DirectoOrder): Order {
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.customercode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    lineItems: Array.isArray(raw.rows) ? raw.rows.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
