import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface PennylanePurchaseOrder {
  id: string
  reference: string
  supplier: { source_id: string } | null
  date: string
  currency: string
  amount: number
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'accepted' || status === 'received') return 'COMPLETED'
  if (status === 'cancelled' || status === 'rejected') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformPurchaseOrder(raw: PennylanePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplier?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
