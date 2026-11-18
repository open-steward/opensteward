import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface LibeoSalesOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  net_amount: number
  account_id: string
  [key: string]: unknown
}

export interface LibeoSalesOrder {
  id: string
  contact_id: string
  currency: string
  total_amount: number
  date: string
  state: string
  lines: LibeoSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(state: string): SalesOrderStatus {
  if (state === 'invoiced') return 'COMPLETED'
  if (state === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: LibeoSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.net_amount,
  }
}

export function transformSalesOrder(raw: LibeoSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
