import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface KontuerelbaSalesOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KontuerelbaSalesOrder {
  id?: string
  status?: string
  counterpartyId?: string
  currencyCode?: string
  total?: number
  date?: string
  lines?: KontuerelbaSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): SalesOrderStatus {
  switch (s) {
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: KontuerelbaSalesOrder): SalesOrder {
  return {
    id: raw.id ? String(raw.id) : '',
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
