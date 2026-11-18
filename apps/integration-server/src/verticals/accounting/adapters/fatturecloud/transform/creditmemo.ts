import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface FattureCloudCreditNote {
  id?: number | string
  number?: string
  entity?: { id?: number | string }
  date?: string
  due_date?: string
  currency?: { id?: string }
  totals?: { amount?: number; vat_amount?: number; amount_due?: number }
  status?: { id?: string }
  [key: string]: unknown
}

function mapStatus(statusId: string | undefined): CreditMemoStatus {
  switch (statusId) {
    case 'draft':
      return 'DRAFT'
    case 'not_paid':
    case 'partial':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: FattureCloudCreditNote): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    creditmemoNumber: raw.number || undefined,
    contactId: raw.entity?.id !== undefined ? String(raw.entity.id) : undefined,
    status: mapStatus(raw.status?.id),
    totalAmount: raw.totals?.amount,
    taxAmount: raw.totals?.vat_amount,
    balanceAmount: raw.totals?.amount_due,
    currency: raw.currency?.id || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
