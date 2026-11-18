import type { Order, OrderStatus } from '../../../schema/order'

// Estimates/quotes in Paraşüt
export interface ParasutOrder {
  id: string
  type: string
  attributes: {
    item_type?: string
    status?: string  // 'draft' | 'sent' | 'cancelled'
    invoice_no?: string
    gross_total?: number
    issue_date?: string
    currency?: string
    contact_id?: string
  }
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'sent': return 'ACTIVE'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: ParasutOrder): Order {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    type: 'SALES',
    status: mapStatus(attrs.status),
    contactId: attrs.contact_id ? String(attrs.contact_id) : undefined,
    currency: attrs.currency || undefined,
    totalAmount: attrs.gross_total,
    postedAt: attrs.issue_date ? new Date(attrs.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
