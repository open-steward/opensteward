import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface SevDeskPurchaseOrder {
  id: string
  orderNumber: string
  contact: { id: string } | null
  orderDate: string
  currency: string
  sumNet: string
  sumGross: string
  sumTax: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === '1000') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformPurchaseOrder(raw: SevDeskPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
