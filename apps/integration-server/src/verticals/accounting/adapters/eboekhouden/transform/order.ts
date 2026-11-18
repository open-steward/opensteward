import type { Order, OrderStatus } from '../../../schema/order'

export interface EBoekhoudenOrder {
  id?: number | string
  orderNumber?: string
  relationId?: number | string
  totalInclTax?: number
  status?: string
  date?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): OrderStatus {
  const s = (status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  if (s === 'completed' || s === 'delivered') return 'COMPLETED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

export function transformOrder(raw: EBoekhoudenOrder): Order {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    totalAmount: raw.totalInclTax,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
