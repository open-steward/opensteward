import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SmartaccountsCreditMemo {
  id: string | number
  number?: string
  date?: string
  total?: number
  tax?: number
  status?: string
  [key: string]: unknown
}

function mapCreditMemoStatus(status?: string): CreditMemoStatus {
  switch (status) {
    case 'authorized':
    case 'AUTHORIZED': return 'AUTHORIZED'
    case 'paid':
    case 'PAID': return 'PAID'
    case 'voided':
    case 'VOIDED':
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: SmartaccountsCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.number || undefined,
    status: mapCreditMemoStatus(raw.status),
    totalAmount: raw.total,
    taxAmount: raw.tax,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
