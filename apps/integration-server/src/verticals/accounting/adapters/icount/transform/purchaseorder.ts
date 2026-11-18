import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { ICountInvoice } from './invoice'

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'ACTIVE'
    case 'paid': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: ICountInvoice): PurchaseOrder {
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
