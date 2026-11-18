import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface FinlyCreditMemo {
  id: string
  credit_note_number: string
  vendor_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  date: string
  due_date: string
  status: string
  paid_amount: number
  [key: string]: unknown
}

function mapStatus(cm: FinlyCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase()
  if (s === 'void') return 'VOIDED'
  if (s === 'rejected') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'approved' || s === 'pending_approval') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: FinlyCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.vendor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.total_amount - (raw.paid_amount ?? 0),
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
