import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SendRegningCreditMemo {
  id: string
  creditNo?: string
  date?: string
  dueDate?: string
  total?: number
  vatAmount?: number
  status?: string
  recipientId?: string
  [key: string]: unknown
}

function mapStatus(raw: SendRegningCreditMemo): CreditMemoStatus {
  switch (raw.status?.toLowerCase()) {
    case 'issued':
      return 'AUTHORIZED'
    case 'applied':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: SendRegningCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNo || undefined,
    contactId: raw.recipientId || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vatAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
