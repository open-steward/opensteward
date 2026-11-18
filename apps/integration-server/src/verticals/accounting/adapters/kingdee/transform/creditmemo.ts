import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeeCreditMemoLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  taxAmount?: number
  acctId?: string
  [key: string]: unknown
}

export interface KingdeeCreditMemo {
  id?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  custId?: string
  currId?: string
  status?: string
  lines?: KingdeeCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): CreditMemoStatus {
  switch (s) {
    case 'A': return 'AUTHORIZED'
    case 'B': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: KingdeeCreditMemo): CreditMemo {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    creditmemoNumber: raw.billNo || undefined,
    contactId: raw.custId ? String(raw.custId) : undefined,
    currency: raw.currId || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.qty,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.acctId ? String(l.acctId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
