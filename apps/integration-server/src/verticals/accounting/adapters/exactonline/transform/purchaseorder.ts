import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface ExactPurchaseOrder {
  PurchaseOrderID?: string
  PurchaseOrderNumber?: number | string
  Supplier?: string
  AmountDC?: number
  Currency?: string
  Status?: number
  OrderDate?: string
  [key: string]: unknown
}

function mapStatus(status: number | undefined): PurchaseOrderStatus {
  switch (status) {
    case 10:
      return 'DRAFT'
    case 50:
      return 'COMPLETED'
    case 60:
      return 'CANCELLED'
    case 20:
    case 30:
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: ExactPurchaseOrder): PurchaseOrder {
  return {
    id: raw.PurchaseOrderID || undefined,
    status: mapStatus(raw.Status),
    contactId: raw.Supplier || undefined,
    totalAmount: raw.AmountDC,
    currency: raw.Currency || undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
