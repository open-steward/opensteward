import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ZervantOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  total?: number
  accountCode?: string
  [key: string]: unknown
}

export interface ZervantOrder {
  id: string
  contactId?: string
  date?: string
  currency?: string
  totalAmount?: number
  status?: string
  type?: string
  rows?: ZervantOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'ACTIVE'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: ZervantOrderLine): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: ZervantOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.rows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
