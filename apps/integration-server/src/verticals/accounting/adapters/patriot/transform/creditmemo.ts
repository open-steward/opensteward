import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface PatriotCreditMemo {
  id: string
  number: string
  contact_id: string
  currency: string
  date: string
  due_date: string
  status: string
  total_amount: number
  tax_amount: number
  paid_amount: number
  remaining_amount: number
  [key: string]: unknown
}

function mapStatus(cm: PatriotCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid' || (s === 'approved' && cm.remaining_amount === 0 && cm.paid_amount > 0))
    return 'PAID'
  if (s === 'partially_paid' || (s === 'approved' && cm.paid_amount > 0 && cm.remaining_amount > 0))
    return 'PARTIALLY_PAID'
  if (s === 'approved' || s === 'pending') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: PatriotCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.remaining_amount,
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
