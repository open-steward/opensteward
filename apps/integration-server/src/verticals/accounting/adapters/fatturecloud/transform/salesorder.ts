import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface FattureCloudSalesOrder {
  id?: number | string
  number?: string
  entity?: { id?: number | string }
  date?: string
  currency?: { id?: string }
  totals?: { amount?: number }
  status?: { id?: string }
  [key: string]: unknown
}

function mapStatus(statusId: string | undefined): SalesOrderStatus {
  switch (statusId) {
    case 'draft':
      return 'DRAFT'
    case 'invoiced':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformSalesOrder(raw: FattureCloudSalesOrder): SalesOrder {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw.status?.id),
    contactId: raw.entity?.id !== undefined ? String(raw.entity.id) : undefined,
    totalAmount: raw.totals?.amount,
    currency: raw.currency?.id || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
