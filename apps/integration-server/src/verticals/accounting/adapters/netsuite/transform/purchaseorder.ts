import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface NetSuitePurchaseOrder {
  id?: string | number
  tranId?: string
  entity?: string | number
  total?: number
  currency?: string
  tranDate?: string
  status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): PurchaseOrderStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('fully received') || s.includes('closed') || s.includes('fully billed')) return 'COMPLETED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('pending')) return 'DRAFT'
  return 'ACTIVE'
}

export function transformPurchaseOrder(raw: NetSuitePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw.status),
    contactId: raw.entity !== undefined ? String(raw.entity) : undefined,
    totalAmount: raw.total,
    currency: raw.currency || undefined,
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
