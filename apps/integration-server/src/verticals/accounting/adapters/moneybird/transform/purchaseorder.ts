import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface MoneybirdPurchaseOrder {
  id?: number | string
  contact_id?: number | string
  total_price_incl_tax?: string | number
  currency?: string
  state?: string
  date?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): PurchaseOrderStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'completed':
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: MoneybirdPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw.state),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_price_incl_tax !== undefined ? Number(raw.total_price_incl_tax) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
