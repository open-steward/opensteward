import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SunriseCreditMemo {
  id: string
  credit_memo_number: string
  contact_id: string
  currency: string
  total_amount: number
  tax_amount: number
  paid_amount: number
  balance_amount: number
  date: string
  due_date: string
  status: string
  [key: string]: unknown
}

function mapStatus(cm: SunriseCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase() ?? ''
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'viewed' || s === 'overdue') return 'AUTHORIZED'
  if (s === 'void') return 'VOIDED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: SunriseCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.balance_amount,
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
