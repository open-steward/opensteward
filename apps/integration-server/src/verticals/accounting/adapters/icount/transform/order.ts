import type { Order, OrderStatus } from '../../../schema/order'
import type { ICountInvoice } from './invoice'

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'ACTIVE'
    case 'paid': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: ICountInvoice): Order {
  return {
    id: raw.doc_id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.sum,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
