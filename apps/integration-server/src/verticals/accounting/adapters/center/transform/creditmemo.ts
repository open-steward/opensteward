import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface CenterCreditMemo {
  id: string
  creditMemoNumber: string
  contactId: string
  currency: string
  subtotal: number
  taxAmount: number
  total: number
  date: string
  dueDate: string
  status: string
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(cm: CenterCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase() ?? ''
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'deleted') return 'DELETED'
  if (s === 'paid') return 'PAID'
  if ((s === 'sent' || s === 'authorized') && cm.paidAmount > 0 && cm.paidAmount < cm.total) return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'authorized' || s === 'overdue') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: CenterCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.creditMemoNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.total - (raw.paidAmount ?? 0),
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
