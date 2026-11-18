import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinmapSalesOrderItem {
  id: string
  name: string
  price: number
  count: number
  total: number
  [key: string]: unknown
}

export interface FinmapSalesOrder {
  id: string
  date: string
  status: string
  currency?: string
  total?: number
  counterpartyId?: string
  items?: FinmapSalesOrderItem[]
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

function mapLineitem(item: FinmapSalesOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.count,
    totalAmount: item.total,
  }
}

export function transformSalesOrder(raw: FinmapSalesOrder): SalesOrder {
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
