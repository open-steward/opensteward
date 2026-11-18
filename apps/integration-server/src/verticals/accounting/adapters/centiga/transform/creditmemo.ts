import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface CentigaCreditMemo {
  id: string
  number?: string
  date?: string
  due_date?: string
  total_amount?: number
  tax_amount?: number
  status?: string
  customer_id?: string
  [key: string]: unknown
}

function mapStatus(raw: CentigaCreditMemo): CreditMemoStatus {
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

export function transformCreditMemo(raw: CentigaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customer_id || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
