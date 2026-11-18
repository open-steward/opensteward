import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AxonautSalesOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  pretax_amount: number
  taxes_amount: number
  account_id: string
  [key: string]: unknown
}

export interface AxonautSalesOrder {
  id: string
  number: string
  client_id: string
  currency: string
  creation_date: string
  total_amount: number
  status: string
  lines: AxonautSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: AxonautSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.pretax_amount,
    taxAmount: row.taxes_amount,
  }
}

export function transformSalesOrder(raw: AxonautSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.creation_date ? new Date(raw.creation_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
