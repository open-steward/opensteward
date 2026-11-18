import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface IntacctPurchaseOrder {
  RECORDNO: string
  DOCID: string
  VENDORID: string
  WHENORDERED: string
  WHENDUE: string
  CURRENCY: string
  TOTAL: string
  STATE: 'Draft' | 'Pending' | 'Closed' | 'Cancelled'
  [key: string]: unknown
}

function mapStatus(state: IntacctPurchaseOrder['STATE']): PurchaseOrderStatus {
  if (state === 'Closed') return 'COMPLETED'
  if (state === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformPurchaseOrder(raw: IntacctPurchaseOrder): PurchaseOrder {
  return {
    id: raw.RECORDNO,
    status: mapStatus(raw.STATE),
    contactId: raw.VENDORID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTAL),
    postedAt: raw.WHENORDERED ? new Date(raw.WHENORDERED) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
