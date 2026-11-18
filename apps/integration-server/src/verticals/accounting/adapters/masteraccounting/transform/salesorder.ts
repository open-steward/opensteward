import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface MasteraccountingSalesOrderLine {
  id: string
  description?: string
  unitPrice: number
  quantity: number
  amount: number
  [key: string]: unknown
}

export interface MasteraccountingSalesOrder {
  id: string
  date: string
  status: string
  currency?: string
  totalSum?: number
  partnerId?: string
  lines?: MasteraccountingSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'COMPLETED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MasteraccountingSalesOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformSalesOrder(raw: MasteraccountingSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
