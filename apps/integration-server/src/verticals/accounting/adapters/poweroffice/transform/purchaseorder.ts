import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface PowerOfficePurchaseOrder {
  id: number
  supplierId: number
  orderDate: string
  currencyCode: string
  grossAmount: number
  status: number
  orderNo: string
  [key: string]: unknown
}

function mapStatus(status: number): PurchaseOrderStatus {
  if (status === 5) return 'COMPLETED'
  if (status === 9) return 'CANCELLED'
  return 'ACTIVE'
}

export function transformPurchaseOrder(raw: PowerOfficePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.grossAmount,
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
