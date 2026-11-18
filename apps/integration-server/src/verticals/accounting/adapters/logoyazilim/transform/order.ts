import type { Order, OrderStatus } from '../../../schema/order'

export interface LogoOrder {
  id: string
  Date?: string
  Status?: string  // 'Draft' | 'Active' | 'Completed' | 'Cancelled'
  ContactId?: string
  TotalAmount?: number
  Lines?: unknown[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'Active': return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: LogoOrder): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
    status: mapStatus(raw.Status),
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
