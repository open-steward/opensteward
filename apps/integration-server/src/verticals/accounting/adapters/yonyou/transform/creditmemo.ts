import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouCreditMemoLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouCreditMemo {
  id?: string
  code?: string
  vouchdate?: string
  duedate?: string
  ttaxmny?: number
  tax?: number
  status?: number | string
  custid?: string
  currency?: string
  lines?: YonyouCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): CreditMemoStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: YonyouCreditMemo): CreditMemo {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    creditmemoNumber: raw.code || undefined,
    contactId: raw.custid ? String(raw.custid) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.ttaxmny,
    taxAmount: raw.tax,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    dueAt: raw.duedate ? new Date(raw.duedate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
