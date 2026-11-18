import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface TorgsoftSalesOrderItem {
  id: string
  title: string
  price: number
  quantity: number
  total: number
  [key: string]: unknown
}

export interface TorgsoftSalesOrder {
  id: string
  date: string
  status: string
  currency?: string
  total_amount?: number
  client_id?: string
  items?: TorgsoftSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'new':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: TorgsoftSalesOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.title || undefined,
    unitAmount: item.price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
  }
}

export function transformSalesOrder(raw: TorgsoftSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
