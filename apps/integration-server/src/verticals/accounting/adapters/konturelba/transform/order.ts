import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface KonturelbaOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KonturelbaOrder {
  id?: string
  status?: string
  counterpartyId?: string
  currencyCode?: string
  total?: number
  date?: string
  lines?: KonturelbaOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): OrderStatus {
  switch (s) {
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: KonturelbaOrder): Order {
  return {
    id: raw.id ? String(raw.id) : '',
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.counterpartyId ? String(raw.counterpartyId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total,
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
