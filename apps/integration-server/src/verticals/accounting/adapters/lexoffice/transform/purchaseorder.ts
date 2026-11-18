import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface LexofficePurchaseOrder {
  id: string
  voucherNumber: string
  voucherDate: string
  deliveryDate: string
  contactId: string
  totalAmount: number
  currency: string
  voucherStatus: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'ACTIVE'
    case 'accepted':
    case 'received': return 'COMPLETED'
    case 'cancelled':
    case 'rejected': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: LexofficePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.voucherStatus),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
