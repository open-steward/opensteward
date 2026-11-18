import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface FreshBooksSalesOrder {
  id: number
  client_id: number
  so_number: string
  date: string
  currency_code: string
  amount: { amount: string; code: string }
  status: number
  [key: string]: unknown
}

function mapStatus(status: number): SalesOrderStatus {
  switch (status) {
    case 1: return 'DRAFT'
    case 4: return 'ACTIVE'
    case 5: return 'COMPLETED'
    case 6: return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: FreshBooksSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
