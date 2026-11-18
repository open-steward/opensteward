import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface KonturelbaReturnLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KontuerelbaCreditMemo {
  id?: string
  number?: string
  date?: string
  dueDate?: string
  total?: number
  vatTotal?: number
  status?: string
  counterpartyId?: string
  currencyCode?: string
  lines?: KonturelbaReturnLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): CreditMemoStatus {
  switch (s) {
    case 'paid': return 'PAID'
    case 'sent': return 'AUTHORIZED'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: KontuerelbaCreditMemo): CreditMemo {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.counterpartyId ? String(raw.counterpartyId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vatTotal,
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
