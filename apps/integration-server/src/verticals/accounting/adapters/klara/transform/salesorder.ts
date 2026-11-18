/**
 * KLARA order (Auftrag) transform — mapped to canonical SalesOrder.
 *
 * KLARA sales orders (Aufträge) are confirmed customer orders.
 * Fields: id, order_number, status, contact_id, currency, total_amount,
 *         order_date, notes, positions[]
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraSalesOrderPosition {
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

export interface KlaraSalesOrder {
  id: string
  order_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  order_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
  positions?: KlaraSalesOrderPosition[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): SalesOrderStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'confirmed':
    case 'active':
    case 'open': return 'ACTIVE'
    case 'completed':
    case 'closed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapPositions(positions: KlaraSalesOrderPosition[]): Lineitem[] {
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

export function transformSalesOrder(raw: KlaraSalesOrder): SalesOrder {
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
