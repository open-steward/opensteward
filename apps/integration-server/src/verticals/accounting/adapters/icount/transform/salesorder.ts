import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { ICountInvoice } from './invoice'

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'ACTIVE'
    case 'paid': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: ICountInvoice): SalesOrder {
  return {
    id: raw.doc_id,
    status: mapStatus(raw.status),
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.sum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
