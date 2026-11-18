/**
 * KLARA purchase order (Bestellung) transform.
 *
 * KLARA purchase orders are issued to suppliers.
 * Fields: id, purchase_order_number, status, contact_id, currency,
 *         total_amount, order_date, delivery_date, notes, positions[]
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraPurchaseOrderPosition {
  id?: string
  article_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate_id?: string
  account_id?: string
  [key: string]: unknown
}

export interface KlaraPurchaseOrder {
  id: string
  purchase_order_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  order_date?: string
  delivery_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
  positions?: KlaraPurchaseOrderPosition[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): PurchaseOrderStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'sent':
    case 'open':
    case 'active': return 'ACTIVE'
    case 'received':
    case 'completed':
    case 'closed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapPositions(positions: KlaraPurchaseOrderPosition[]): Lineitem[] {
  return positions.map((p) => ({
    id: p.id || undefined,
    accountId: p.account_id || undefined,
    itemId: p.article_id || undefined,
    itemDescription: p.description || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    totalAmount: p.total_price,
    taxrateId: p.tax_rate_id || undefined,
  }))
}

export function transformPurchaseOrder(raw: KlaraPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.positions ?? []).length > 0 ? mapPositions(raw.positions ?? []) : undefined,
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
