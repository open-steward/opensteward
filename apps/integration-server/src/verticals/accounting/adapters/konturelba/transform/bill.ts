import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface KontuerelbaBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KonturelbaExpenseBill {
  id?: string
  number?: string
  date?: string
  dueDate?: string
  total?: number
  vatTotal?: number
  status?: string
  counterpartyId?: string
  currencyCode?: string
  lines?: KontuerelbaBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): BillStatus {
  switch (s) {
    case 'paid': return 'PAID'
    case 'sent': return 'AUTHORIZED'
    case 'cancelled': return 'VOIDED'
    case 'draft': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: KonturelbaExpenseBill): Bill {
  return {
    id: raw.id ? String(raw.id) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.counterpartyId ? String(raw.counterpartyId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vatTotal,
    balanceAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
