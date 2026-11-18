import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface FreshBooksPurchaseOrder {
  id: number
  vendor_id: number
  po_number: string
  date: string
  currency_code: string
  amount: { amount: string; code: string }
  status: number
  [key: string]: unknown
}

function mapStatus(status: number): PurchaseOrderStatus {
  switch (status) {
    case 1: return 'DRAFT'
    case 4: return 'ACTIVE'
    case 5: return 'COMPLETED'
    case 6: return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: FreshBooksPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
