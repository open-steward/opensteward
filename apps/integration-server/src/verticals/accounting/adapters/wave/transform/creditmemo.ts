import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface WaveCreditMemo {
  id: string
  creditNoteNumber: string
  customer: { id: string } | null
  currency: { code: string } | null
  totalAmount: number
  amountDue: number
  amountPaid: number
  invoiceDate: string
  status: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapStatus(status: string, cm: WaveCreditMemo): CreditMemoStatus {
  const s = status.toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'PARTIAL') return 'PARTIALLY_PAID'
  if (s === 'VOIDED') return 'VOIDED'
  if (s === 'DELETED') return 'DELETED'
  if (s === 'SENT' || s === 'VIEWED' || s === 'UNPAID') return 'AUTHORIZED'
  if (s === 'DRAFT') return 'DRAFT'
  if (cm.amountPaid > 0 && cm.amountPaid < cm.totalAmount) return 'PARTIALLY_PAID'
  return 'DRAFT'
}

export function transformCreditMemo(raw: WaveCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status, raw),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.customer?.id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.totalAmount,
    balanceAmount: raw.amountDue,
    paidAmount: raw.amountPaid || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
