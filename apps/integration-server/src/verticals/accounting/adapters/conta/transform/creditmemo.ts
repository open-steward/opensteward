import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface ContaCreditMemo {
  id: string
  credit_number?: string
  date?: string
  due_date?: string
  total?: number
  vat_amount?: number
  status?: string
  customer_id?: string
  [key: string]: unknown
}

function mapStatus(raw: ContaCreditMemo): CreditMemoStatus {
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

export function transformCreditMemo(raw: ContaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_number || undefined,
    contactId: raw.customer_id || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
