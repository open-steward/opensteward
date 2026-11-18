import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

export interface ParasutPurchaseOrder {
  id: string
  type: string
  attributes: {
    status?: string  // 'draft' | 'sent' | 'cancelled' | 'completed'
    invoice_no?: string
    gross_total?: number
    issue_date?: string
    currency?: string
    contact_id?: string
  }
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status) {
    case 'sent': return 'ACTIVE'
    case 'cancelled': return 'CANCELLED'
    case 'completed': return 'COMPLETED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: ParasutPurchaseOrder): PurchaseOrder {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    status: mapStatus(attrs.status),
    contactId: attrs.contact_id ? String(attrs.contact_id) : undefined,
    currency: attrs.currency || undefined,
    totalAmount: attrs.gross_total,
    postedAt: attrs.issue_date ? new Date(attrs.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
