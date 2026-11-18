import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface LogoCreditMemo {
  id: string
  Date?: string
  Amount?: number
  ContactId?: string
  Status?: string  // 'Draft' | 'Authorized' | 'Paid' | 'Voided'
  CurrencyCode?: string
  CreditMemoNumber?: string
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch (status) {
    case 'Authorized': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: LogoCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.CreditMemoNumber || undefined,
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.Amount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
