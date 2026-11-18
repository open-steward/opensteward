import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface TwentyFourSevenCreditMemo {
  id: string
  creditNoteNumber: number
  customerId: string
  currency: string
  issueDate: string
  dueDate: string
  status: string
  totalAmount: number
  taxAmount: number
  balance: number
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(cm: TwentyFourSevenCreditMemo): CreditMemoStatus {
  if (cm.status === 'voided' || cm.status === 'cancelled') return 'VOIDED'
  if (cm.status === 'paid' || (cm.status === 'approved' && cm.balance === 0)) return 'PAID'
  if (cm.status === 'approved' && cm.paidAmount > 0) return 'PARTIALLY_PAID'
  if (cm.status === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: TwentyFourSevenCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNoteNumber ? String(raw.creditNoteNumber) : undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
