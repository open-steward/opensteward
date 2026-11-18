import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface DilovodSalesOrderItem {
  id: string
  name: string
  price: number
  qty: number
  sum: number
  [key: string]: unknown
}

export interface DilovodSalesOrder {
  id: string
  date: string
  status: string
  currency?: string
  total?: number
  contractor_id?: string
  items?: DilovodSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
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

function mapLineitem(item: DilovodSalesOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.qty,
    totalAmount: item.sum,
  }
}

export function transformSalesOrder(raw: DilovodSalesOrder): SalesOrder {
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
