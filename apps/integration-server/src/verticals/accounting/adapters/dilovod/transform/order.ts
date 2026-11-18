import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface DilovodOrderItem {
  id: string
  name: string
  price: number
  qty: number
  sum: number
  [key: string]: unknown
}

export interface DilovodOrder {
  id: string
  date: string
  status: string
  currency?: string
  total?: number
  contractor_id?: string
  items?: DilovodOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(item: DilovodOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.qty,
    totalAmount: item.sum,
  }
}

export function transformOrder(raw: DilovodOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contractor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
