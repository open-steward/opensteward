import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface GustoSalesOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  [key: string]: unknown
}

export interface GustoSalesOrder {
  id: string | number
  status: string
  date: string
  company_id?: string | number
  total_amount: number
  currency?: string
  lines?: GustoSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'delivered':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoSalesOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
  }
}

export function transformSalesOrder(raw: GustoSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.company_id ? String(raw.company_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
