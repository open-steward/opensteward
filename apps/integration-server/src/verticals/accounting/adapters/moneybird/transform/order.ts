import type { Order, OrderStatus } from '../../../schema/order'

export interface MoneybirdOrder {
  id?: number | string
  contact_id?: number | string
  total_price_incl_tax?: string | number
  currency?: string
  state?: string
  date?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): OrderStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'ACTIVE'
    case 'completed':
    case 'invoiced':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: MoneybirdOrder): Order {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: 'SALES',
    status: mapStatus(raw.state),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_price_incl_tax !== undefined ? Number(raw.total_price_incl_tax) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
