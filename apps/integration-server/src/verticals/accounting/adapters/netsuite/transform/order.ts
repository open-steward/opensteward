import type { Order, OrderStatus } from '../../../schema/order'

export interface NetSuiteOrder {
  id?: string | number
  tranId?: string
  entity?: string | number
  total?: number
  currency?: string
  tranDate?: string
  status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): OrderStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('closed') || s.includes('billed') || s.includes('fully billed')) return 'COMPLETED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('pending')) return 'DRAFT'
  return 'ACTIVE'
}

export function transformOrder(raw: NetSuiteOrder): Order {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.entity !== undefined ? String(raw.entity) : undefined,
    totalAmount: raw.total,
    currency: raw.currency || undefined,
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
