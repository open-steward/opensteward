import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

// Qoyod does not expose a standalone "orders" resource distinct from quotes
// and invoices. This transform maps a Qoyod invoice used as a sales order
// (e.g. draft invoices treated as orders in the workflow).
export interface QoyodOrderLineItem {
  id?: number | null
  product_id?: number | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tax_amount?: number | null
  total?: number | null
  discount?: number | null
  account_id?: number | null
  [key: string]: unknown
}

export interface QoyodOrder {
  id: number
  reference?: string | null
  customer_id?: number | null
  date?: string | null
  status?: string | null
  notes?: string | null
  currency?: string | null
  total?: number | null
  tax_total?: number | null
  line_items?: QoyodOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: QoyodOrder): OrderStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'invoiced' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineItem(li: QoyodOrderLineItem): Lineitem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    itemId: li.product_id != null ? String(li.product_id) : undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_price ?? undefined,
    unitQuantity: li.quantity ?? undefined,
    totalAmount: li.total ?? undefined,
    taxAmount: li.tax_amount ?? undefined,
    discountAmount: li.discount ?? undefined,
    accountId: li.account_id != null ? String(li.account_id) : undefined,
  }
}

export function transformOrder(raw: QoyodOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
