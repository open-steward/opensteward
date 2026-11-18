import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface InvoiceqPurchaseOrder {
  id: string
  order_number?: string
  date?: string
  status?: string
  total_amount?: number
  supplier_id?: string
  currency_code?: string
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case 'Completed':
    case 'completed':
      return 'COMPLETED'
    case 'Cancelled':
    case 'cancelled':
      return 'CANCELLED'
    case 'Draft':
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: InvoiceqPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
