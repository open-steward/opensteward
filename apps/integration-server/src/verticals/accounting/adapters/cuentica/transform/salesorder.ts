import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface CuenticaSalesOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  account: string
  [key: string]: unknown
}

export interface CuenticaSalesOrder {
  id: string
  number: string
  date: string
  status: string
  contact_id: string
  currency: string
  total: number
  lines: CuenticaSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: CuenticaSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformSalesOrder(raw: CuenticaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
