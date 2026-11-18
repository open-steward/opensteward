import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface KashooCreditMemo {
  id: string
  credit_memo_number: string
  contact_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  date: string
  due_date: string
  status: string
  paid_amount: number
  [key: string]: unknown
}

function mapStatus(cm: KashooCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase()
  if (s === 'void') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'sent' && cm.paid_amount > 0 && cm.paid_amount < cm.total) return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'overdue') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: KashooCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.total - (raw.paid_amount ?? 0),
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
