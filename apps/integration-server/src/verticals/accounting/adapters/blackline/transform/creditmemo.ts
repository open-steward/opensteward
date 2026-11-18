import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BlacklineCreditMemoLine {
  lineId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BlacklineCreditMemo {
  reconciliationId: string
  creditMemoNumber: string
  status: string
  accountId: string
  currency: string
  amount: number
  taxAmount: number
  postedDate: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklineCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Approved':
    case 'Submitted':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BlacklineCreditMemoLine): Lineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformCreditMemo(raw: BlacklineCreditMemo): CreditMemo {
  return {
    id: String(raw.reconciliationId),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditMemoNumber || undefined,
    contactId: raw.accountId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.postedDate ? new Date(raw.postedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
