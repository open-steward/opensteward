import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ChanjetOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface ChanjetOrder {
  id?: string
  status?: string
  clientId?: string
  currencyCode?: string
  totalAmount?: number
  date?: string
  lines?: ChanjetOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): OrderStatus {
  switch (s) {
    case 'ACTIVE': return 'ACTIVE'
    case 'COMPLETED': return 'COMPLETED'
    case 'CANCELLED': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: ChanjetOrder): Order {
  return {
    id: raw.id ? String(raw.id) : '',
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
