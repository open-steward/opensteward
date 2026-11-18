import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface FinmapCreditMemo {
  id: string
  number: string
  date: string
  amount: number
  tax?: number
  status: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'active':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'deleted':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: FinmapCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
