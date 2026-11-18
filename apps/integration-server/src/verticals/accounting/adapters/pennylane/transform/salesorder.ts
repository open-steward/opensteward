import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface PennylaneSalesOrder {
  id: string
  reference: string
  customer: { source_id: string } | null
  date: string
  currency: string
  amount: number
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'accepted' || status === 'invoiced') return 'COMPLETED'
  if (status === 'cancelled' || status === 'rejected') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformSalesOrder(raw: PennylaneSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customer?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
