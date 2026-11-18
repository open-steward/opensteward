import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface DilovodPurchaseOrderItem {
  id: string
  name: string
  price: number
  qty: number
  sum: number
  [key: string]: unknown
}

export interface DilovodPurchaseOrder {
  id: string
  date: string
  status: string
  currency?: string
  total?: number
  contractor_id?: string
  items?: DilovodPurchaseOrderItem[]
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

function mapLineitem(item: DilovodPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.qty,
    totalAmount: item.sum,
  }
}

export function transformPurchaseOrder(raw: DilovodPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contractor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
