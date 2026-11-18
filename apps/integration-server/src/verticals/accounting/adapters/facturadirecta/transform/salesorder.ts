import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FacturadirectaSalesOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  account_id: string
  [key: string]: unknown
}

export interface FacturadirectaSalesOrder {
  id: string
  document_number: string
  document_date: string
  document_status: string
  client_id: string
  currency: string
  total_amount: number
  lines: FacturadirectaSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(document_status: string): SalesOrderStatus {
  switch (document_status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: FacturadirectaSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformSalesOrder(raw: FacturadirectaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.document_status),
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
