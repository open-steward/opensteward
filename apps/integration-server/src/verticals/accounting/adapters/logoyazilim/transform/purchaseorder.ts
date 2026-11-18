import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface LogoPurchaseOrder {
  id: string
  Date?: string
  Status?: string  // 'Draft' | 'Active' | 'Completed' | 'Cancelled'
  ContactId?: string
  TotalAmount?: number
  Lines?: unknown[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case 'Active': return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: LogoPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
