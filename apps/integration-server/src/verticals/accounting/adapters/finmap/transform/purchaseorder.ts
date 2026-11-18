import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinmapPurchaseOrderItem {
  id: string
  name: string
  price: number
  count: number
  total: number
  [key: string]: unknown
}

export interface FinmapPurchaseOrder {
  id: string
  date: string
  status: string
  currency?: string
  total?: number
  counterpartyId?: string
  items?: FinmapPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE'
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinmapPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.count,
    totalAmount: item.total,
  }
}

export function transformPurchaseOrder(raw: FinmapPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.counterpartyId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
