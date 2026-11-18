import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface DaftraPurchaseOrder {
  id: string
  OrderNo?: string
  Date?: string
  Status?: string
  TotalAmount?: number
  SupplierId?: string
  Currency?: string
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

export function transformPurchaseOrder(raw: DaftraPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
