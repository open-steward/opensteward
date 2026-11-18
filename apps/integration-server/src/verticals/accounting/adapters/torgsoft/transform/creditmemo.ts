import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface TorgsoftCreditMemo {
  id: string
  invoice_number: string
  invoice_date: string
  total_amount: number
  tax_amount?: number
  status: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'confirmed':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    case 'new':
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: TorgsoftCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoice_number || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
