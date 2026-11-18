import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface SpeedLedgerSalesOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountNumber?: string | number
  [key: string]: unknown
}

export interface SpeedLedgerSalesOrder {
  id: number | string
  contactId?: number | string
  date?: string
  currency?: string
  totalInclVat?: number
  status?: string
  lines?: SpeedLedgerSalesOrderLine[]
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

function mapLineitem(line: SpeedLedgerSalesOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.accountNumber !== undefined ? String(line.accountNumber) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformSalesOrder(raw: SpeedLedgerSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contactId !== undefined ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
