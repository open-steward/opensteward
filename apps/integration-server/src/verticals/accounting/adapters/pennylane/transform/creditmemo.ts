import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface PennylaneCreditNote {
  id: string
  invoice_number: string
  customer: { source_id: string } | null
  date: string
  currency: string
  amount: number
  remaining_amount: number
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'not_sent':
    case 'sent':
    case 'received':
      return 'AUTHORIZED'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: PennylaneCreditNote): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoice_number || undefined,
    contactId: raw.customer?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    balanceAmount: raw.remaining_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
