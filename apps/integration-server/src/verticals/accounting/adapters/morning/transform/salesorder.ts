import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { MorningDocument } from './invoice'

function mapStatus(status: number): SalesOrderStatus {
  switch (status) {
    case 0: return 'DRAFT'
    case 1: return 'ACTIVE'
    case 2: return 'COMPLETED'
    case -1: return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: MorningDocument): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.client?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
