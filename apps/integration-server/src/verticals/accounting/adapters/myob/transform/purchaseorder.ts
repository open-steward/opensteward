import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface MyobPurchaseOrder {
  UID?: string
  Number?: string
  Supplier?: { UID?: string }
  Date?: string
  TotalAmount?: number
  Status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): PurchaseOrderStatus {
  switch (status) {
    case 'Closed':
      return 'COMPLETED'
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: MyobPurchaseOrder): PurchaseOrder {
  return {
    id: raw.UID || undefined,
    status: mapStatus(raw.Status),
    contactId: raw.Supplier?.UID || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
