import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface MaxioPurchaseOrderLineItem {
  id: number
  name: string
  quantity: number
  unit_price_in_cents: number
  total_amount_in_cents: number
  [key: string]: unknown
}

export interface MaxioPurchaseOrder {
  id: number
  state: string
  created_at: string
  currency: string
  total_amount_in_cents: number
  vendor_id: number | null
  line_items: MaxioPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(state: string): PurchaseOrderStatus {
  switch (state) {
    case 'active':
      return 'ACTIVE'
    case 'completed':
      return 'COMPLETED'
    case 'canceled':
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MaxioPurchaseOrderLineItem): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.name || undefined,
    unitAmount: typeof line.unit_price_in_cents === 'number' ? line.unit_price_in_cents / 100 : 0,
    unitQuantity: line.quantity,
    totalAmount: typeof line.total_amount_in_cents === 'number' ? line.total_amount_in_cents / 100 : 0,
  }
}

export function transformPurchaseOrder(raw: MaxioPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: typeof raw.total_amount_in_cents === 'number' ? raw.total_amount_in_cents / 100 : 0,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
