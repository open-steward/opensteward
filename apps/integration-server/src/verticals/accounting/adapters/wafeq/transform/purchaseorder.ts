import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface WafeqPurchaseOrder {
  id: string
  number?: string
  date?: string
  status?: string
  total?: number
  contact_id?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: WafeqPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
