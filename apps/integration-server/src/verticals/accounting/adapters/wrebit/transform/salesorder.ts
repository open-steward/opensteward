import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface WrebitSalesOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  account?: string | number
  [key: string]: unknown
}

export interface WrebitSalesOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  gross_amount?: number
  status?: string
  lines?: WrebitSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
    case 'delivered':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: WrebitSalesOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account !== undefined ? String(line.account) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformSalesOrder(raw: WrebitSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
