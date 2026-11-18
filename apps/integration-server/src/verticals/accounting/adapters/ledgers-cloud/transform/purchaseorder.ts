/**
 * LEDGERS.Cloud purchase order transform.
 *
 * Endpoints:
 *   GET  /v3/purchase-order/{id}   — view single
 *   GET  /v3/list-purchase-order   — paginated list
 *   POST /v3/add-purchase-order    — create
 *   PUT  /v3/update-purchase-order — update
 *
 * Wire fields: id, po_number, po_date, due_date, contact.id / contact_id,
 *   currency, po_status, total_amount, items[]
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface LedgersPurchaseOrderItem {
  id?: string | number
  item_id?: string | number
  name?: string
  description?: string
  unit_price?: number
  quantity?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface LedgersPurchaseOrder {
  id?: string | number
  po_number?: string
  document_number?: string
  po_date?: string
  due_date?: string
  created_at?: string
  updated_at?: string
  contact?: { id?: string | number; contact_id?: string | number }
  contact_id?: string | number
  currency?: string
  po_status?: string            // "Open" | "Closed" | "Cancelled" | "Draft"
  status?: string
  total_amount?: number
  tax_amount?: number
  discount_amount?: number
  notes?: string
  items?: LedgersPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(raw: LedgersPurchaseOrder): PurchaseOrderStatus {
  const s = (raw.po_status || raw.status || '').toLowerCase()
  if (s === 'closed' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLines(items: LedgersPurchaseOrderItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    id: it.id != null ? String(it.id) : undefined,
    itemId: it.item_id != null ? String(it.item_id) : undefined,
    itemName: it.name || undefined,
    itemDescription: it.description || undefined,
    accountId: it.account_id != null ? String(it.account_id) : undefined,
    unitAmount: it.unit_price,
    unitQuantity: it.quantity != null ? Math.round(it.quantity) : undefined,
    taxAmount: it.tax_amount,
    totalAmount: it.amount,
  }))
}

export function transformPurchaseOrder(raw: LedgersPurchaseOrder): PurchaseOrder {
  const contactId =
    raw.contact?.id ??
    raw.contact?.contact_id ??
    raw.contact_id
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw),
    contactId: contactId != null ? String(contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: raw.items ? mapLines(raw.items) : undefined,
    postedAt: raw.po_date ? new Date(raw.po_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
