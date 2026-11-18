import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface LucaCreditMemo {
  id: string
  credit_no?: string
  date?: string
  due_date?: string
  total?: number
  vat?: number
  status?: string
  customer_id?: string
  [key: string]: unknown
}

function mapStatus(raw: LucaCreditMemo): CreditMemoStatus {
  switch (raw.status?.toLowerCase()) {
    case 'issued':
      return 'AUTHORIZED'
    case 'applied':
      return 'PAID'
    case 'void':
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: LucaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_no || undefined,
    contactId: raw.customer_id || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
