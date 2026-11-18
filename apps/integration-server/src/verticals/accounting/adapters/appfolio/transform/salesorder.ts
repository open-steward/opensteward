import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AppFolioSalesOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface AppFolioSalesOrder {
  id: string | number
  order_number: string
  tenant_id: string | number
  property_id: string | number
  lease_id: string | number
  date: string
  amount: number
  currency: string
  status: string
  line_items: AppFolioSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AppFolioSalesOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformSalesOrder(raw: AppFolioSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.tenant_id ? String(raw.tenant_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
