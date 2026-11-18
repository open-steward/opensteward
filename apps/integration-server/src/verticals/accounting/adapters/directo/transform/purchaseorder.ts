/**
 * Directo purchase order transform (maps to canonical PurchaseOrder).
 *
 * Endpoint: GET /v1/purchase_orders
 * Single: GET /v1/purchase_orders?number=<n>
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoPurchaseOrderRow {
  rn?: number
  item?: string
  description?: string
  price?: number
  quantity?: number
  account?: string
  vatcode?: string
  sum?: number
  [key: string]: unknown
}

export interface DirectoPurchaseOrder {
  number?: string | number
  date?: string              // order date ISO-8601
  suppliercode?: string      // supplier code
  suppliername?: string
  currency?: string
  sum?: number               // total incl. VAT
  vatsum?: number
  status?: string            // document status
  project?: string
  rows?: DirectoPurchaseOrderRow[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: DirectoPurchaseOrder): PurchaseOrderStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'received' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapLineitem(row: DirectoPurchaseOrderRow): Lineitem {
  return {
    id: row.rn !== undefined ? String(row.rn) : undefined,
    accountId: row.account || undefined,
    itemId: row.item || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformPurchaseOrder(raw: DirectoPurchaseOrder): PurchaseOrder {
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    status: mapStatus(raw),
    contactId: raw.suppliercode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    lineItems: Array.isArray(raw.rows) ? raw.rows.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
